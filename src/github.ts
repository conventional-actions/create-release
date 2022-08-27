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
  github: GitHubT
): Promise<Release> => {
  const repos = github.rest.repos

  const [owner, repo] = config.github_repository.split('/')
  core.debug(`owner = ${owner}, repo = ${repo}`)

  const tag =
    config.input_tag_name ||
    (isTag(config.github_ref)
      ? config.github_ref.replace('refs/tags/', '')
      : '')
  core.debug(`tag = ${tag}`)

  const discussion_category_name = config.input_discussion_category_name || ''
  core.debug(`discussion_category_name = ${discussion_category_name}`)

  const generate_release_notes = config.input_generate_release_notes || false
  core.debug(`generate_release_notes = ${generate_release_notes}`)

  try {
    const existingRelease = await repos.getReleaseByTag({
      owner,
      repo,
      tag
    })
    core.debug(`existingRelease = ${JSON.stringify(existingRelease)}`)

    core.debug('Deleting existing release')

    const release_id = existingRelease.data.id
    core.debug(`existing_release_id = ${release_id}`)

    await repos.deleteRelease({
      owner,
      repo,
      release_id
    })

    core.debug(`deleting ref owner = ${owner}, repo = ${repo}, ref = ${tag}`)
    await github.rest.git.deleteRef({
      owner,
      repo,
      ref: `tags/${tag}`
    })
  } catch (error: any) {
    if (error.status !== 404) {
      throw error
    }

    core.debug('Creating new release')
  }

  const target_commitish = config.input_target_commitish || ''
  core.debug(`target_commitish = ${target_commitish}`)

  const name = config.input_name || tag
  core.debug(`name = ${name}`)

  const body = releaseBody(config) || ''
  core.debug(`body = ${body}`)

  const draft = config.input_draft || false
  core.debug(`draft = ${draft}`)

  const prerelease = config.input_prerelease || false
  core.debug(`prerelease = ${prerelease}`)

  let commitMessage = ''
  if (target_commitish) {
    commitMessage = ` using commit '${target_commitish}'`
  }

  core.info(`Creating new GitHub release for tag ${tag}${commitMessage}...`)

  core.debug(
    `createRequest({${owner}, ${repo}, ${tag}, ${name}, ${body}, ${draft}, ${prerelease}, ${target_commitish}, ${discussion_category_name}, ${generate_release_notes}})`
  )
  const rel = await repos.createRelease({
    owner,
    repo,
    tag_name: tag,
    name,
    // body,
    // draft,
    // prerelease,
    // target_commitish,
    // discussion_category_name,
    generate_release_notes
  })
  core.debug(`rel = ${JSON.stringify(rel)}`)

  return rel.data
}
