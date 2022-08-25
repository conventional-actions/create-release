import * as httpClient from '@actions/http-client'
import {Config, isTag, releaseBody} from './util'
import {statSync, readFileSync} from 'fs'
import {getType} from 'mime'
import {basename} from 'path'
import * as core from '@actions/core'
import {GitHub} from '@actions/github/lib/utils'

type GitHubT = InstanceType<typeof GitHub>

export interface ReleaseAsset {
  name: string
  mime: string
  size: number
  data: Buffer
}

export interface Release {
  id: number
  upload_url: string
  html_url: string
  tag_name: string
  name: string | null
  body?: string | null | undefined
  target_commitish: string
  draft: boolean
  prerelease: boolean
  assets: {id: number; name: string}[]
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
    data: readFileSync(path)
  }
}

export const mimeOrDefault = (path: string): string => {
  return getType(path) || 'application/octet-stream'
}

export const upload = async (
  config: Config,
  github: GitHubT,
  url: string,
  path: string,
  currentAssets: {id: number; name: string}[]
): Promise<string> => {
  const [owner, repo] = config.github_repository.split('/')
  core.debug(`owner = ${owner}, repo = ${repo}`)

  const {name, size, mime, data: body} = asset(path)
  core.debug(`name = ${name}, size = ${size}, mime = ${mime}, body = ${body}`)

  const currentAsset = currentAssets.find(
    ({name: currentName}) => currentName === name
  )
  core.debug(`currentAsset = ${currentAsset}`)

  if (currentAsset) {
    core.info(`Deleting previously uploaded asset ${name}...`)
    await github.rest.repos.deleteReleaseAsset({
      asset_id: currentAsset.id || 1,
      owner,
      repo
    })
  }

  core.info(`Uploading ${name}...`)
  const endpoint = new URL(url)
  endpoint.searchParams.append('name', name)
  core.debug(`endpoint = ${endpoint}`)

  const client = new httpClient.HttpClient()
  const resp = await client.post(endpoint.toString(), body.toString(), {
    'Content-Length': `${size}`,
    'Content-Type': mime,
    Authorization: `token ${config.github_token}`
  })
  core.debug(`resp = ${resp}`)

  return resp.readBody()
}

export const release = async (
  config: Config,
  github: GitHubT,
  maxRetries = 3
): Promise<Release> => {
  if (maxRetries <= 0) {
    throw new Error('Too many retries.')
  }

  const [owner, repo] = config.github_repository.split('/')
  core.debug(`owner = ${owner}, repo = ${repo}`)

  const tag =
    config.input_tag_name ||
    (isTag(config.github_ref)
      ? config.github_ref.replace('refs/tags/', '')
      : '')
  core.debug(`tag = ${tag}`)

  const discussion_category_name = config.input_discussion_category_name
  core.debug(`discussion_category_name = ${discussion_category_name}`)

  const generate_release_notes = config.input_generate_release_notes
  core.debug(`generate_release_notes = ${generate_release_notes}`)

  try {
    const existingRelease = await github.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag
    })
    core.debug(`existingRelease = ${existingRelease}`)

    const release_id = existingRelease.data.id
    core.debug(`release_id = ${release_id}`)

    let target_commitish: string
    if (
      config.input_target_commitish &&
      config.input_target_commitish !== existingRelease.data.target_commitish
    ) {
      core.info(
        `Updating commit from '${existingRelease.data.target_commitish}' to '${config.input_target_commitish}'`
      )
      target_commitish = config.input_target_commitish
    } else {
      target_commitish = existingRelease.data.target_commitish
    }
    core.debug(`target_commitish = ${target_commitish}`)

    const tag_name = tag
    const name = config.input_name || existingRelease.data.name || tag
    // revisit: support a new body-concat-strategy input for accumulating
    // body parts as a release gets updated. some users will likely want this while
    // others won't previously this was duplicating content for most which
    // no one wants
    const workflowBody = releaseBody(config) || ''
    const existingReleaseBody = existingRelease.data.body || ''

    let body: string
    if (config.input_append_body && workflowBody && existingReleaseBody) {
      body = `${existingReleaseBody}\n${workflowBody}`
    } else {
      body = workflowBody || existingReleaseBody
    }
    core.debug(`body = ${body}`)

    const draft =
      config.input_draft !== undefined
        ? config.input_draft
        : existingRelease.data.draft
    const prerelease =
      config.input_prerelease !== undefined
        ? config.input_prerelease
        : existingRelease.data.prerelease
    core.debug(`draft = ${draft}`)
    core.debug(`prerelease = ${prerelease}`)

    const rel = await github.rest.repos.updateRelease({
      owner,
      repo,
      release_id,
      tag_name,
      target_commitish,
      name,
      body,
      draft,
      prerelease,
      discussion_category_name,
      generate_release_notes
    })
    core.debug(`rel = ${rel}`)
    return rel.data
  } catch (error: any) {
    if (error.status === 404) {
      core.debug(`not found`)

      const tag_name = tag
      const name = config.input_name || tag
      const body = releaseBody(config)
      const draft = config.input_draft
      const prerelease = config.input_prerelease
      const target_commitish = config.input_target_commitish
      let commitMessage = ''
      if (target_commitish) {
        commitMessage = ` using commit '${target_commitish}'`
      }

      core.info(
        `Creating new GitHub release for tag ${tag_name}${commitMessage}...`
      )
      try {
        const rel = await github.rest.repos.createRelease({
          owner,
          repo,
          tag_name,
          name,
          body,
          draft,
          prerelease,
          target_commitish,
          discussion_category_name,
          generate_release_notes
        })
        core.debug(`rel = ${rel}`)
        return rel.data
      } catch (error2: any) {
        // presume a race with competing matrix runs
        core.warning(
          `GitHub release failed with status: ${
            error2.status
          }\n${JSON.stringify(error.response.data.errors)}\nretrying... (${
            maxRetries - 1
          } retries remaining)`
        )
        return release(config, github, maxRetries - 1)
      }
    } else {
      throw error
    }
  }
}
