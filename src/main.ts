import {paths, parseConfig, isTag, unmatchedPatterns, uploadUrl} from './util'
import {release, upload} from './github'
import * as github from '@actions/github'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as artifact from '@actions/artifact'

async function run(): Promise<void> {
  try {
    const config = parseConfig(process.env)
    core.debug(`config = ${JSON.stringify(config)}`)

    if (
      !config.input_tag_name &&
      !isTag(config.github_ref) &&
      !config.input_draft
    ) {
      throw new Error(`GitHub Releases requires a tag`)
    }

    if (config.input_files) {
      const patterns = unmatchedPatterns(config.input_files)
      core.debug(`patterns = ${patterns}`)

      for (const pattern of patterns) {
        core.warning(`Pattern '${pattern}' does not match any files.`)
      }

      if (patterns.length > 0 && config.input_fail_on_unmatched_files) {
        throw new Error(`There were unmatched files`)
      }
    }

    const gh = github.getOctokit(config.github_token, {
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          )
          if (options.request.retryCount === 0) {
            core.info(`Retrying after ${retryAfter} seconds!`)
            return true
          }
        },
        onAbuseLimit: (retryAfter: number, options: any) => {
          core.warning(
            `Abuse detected for request ${options.method} ${options.url}`
          )
        }
      }
    })

    const rel = await release(config, gh)
    core.debug(`rel = ${JSON.stringify(rel)}`)

    let input_files = config.input_files || []

    if (config.input_artifacts && config.input_artifacts.length > 0) {
      const artifacts = paths(config.input_artifacts)
      core.debug(`artifacts = ${artifacts}`)

      const artifactPaths = await artifact.create().downloadAllArtifacts()

      for (const artifactPath of artifactPaths) {
        core.debug(
          `artifactPath = ${artifactPath.artifactName}, ${artifactPath.downloadPath}`
        )

        input_files = input_files.concat(`${artifactPath.downloadPath}/*`)
      }
    }
    await exec.exec('ls -laR')

    if (input_files.length > 0) {
      const files = paths(input_files)
      core.debug(`files = ${files}`)

      if (files.length === 0) {
        core.warning(`${input_files} did not include any valid files.`)
      }

      const currentAssets = rel.assets
      core.debug(`currentAssets = ${currentAssets}`)

      const assets = await Promise.all(
        files.map(async path => {
          return upload(
            config,
            gh,
            uploadUrl(rel.upload_url),
            path,
            currentAssets
          )
        })
      )
      core.debug(`assets = ${assets}`)

      core.setOutput('assets', assets)
    }

    core.info(`Release ready at ${rel.html_url}`)
    core.setOutput('url', rel.html_url)
    core.setOutput('id', rel.id.toString())
    core.setOutput('upload_url', rel.upload_url)
  } catch (error: any) {
    core.setFailed(error.toString())
  }
  return
}

run()
