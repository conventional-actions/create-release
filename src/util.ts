import {readFileSync} from 'fs'
import {parseMultiInput} from '@conventional-actions/toolkit'

export interface Config {
  github_token: string
  github_ref: string
  github_repository: string
  input_name?: string
  input_tag_name?: string
  input_repository?: string
  input_body?: string
  input_body_path?: string
  input_files?: string[]
  input_artifacts?: string[]
  input_draft?: boolean
  input_prerelease?: boolean
  input_fail_on_unmatched_files?: boolean
  input_target_commitish?: string
  input_discussion_category_name?: string
  input_generate_release_notes?: boolean
  input_append_body?: boolean
}

export const uploadUrl = (url: string): string => {
  const templateMarkerPos = url.indexOf('{')
  if (templateMarkerPos > -1) {
    return url.substring(0, templateMarkerPos)
  }
  return url
}

export const releaseBody = (config: Config): string | undefined => {
  return (
    (config.input_body_path &&
      readFileSync(config.input_body_path).toString('utf8')) ||
    config.input_body
  )
}

type Env = {[key: string]: string | undefined}

export const parseConfig = (env: Env): Config => {
  return {
    github_token: env.INPUT_TOKEN || env.GITHUB_TOKEN || '',
    github_ref: env.GITHUB_REF || '',
    github_repository: env.INPUT_REPOSITORY || env.GITHUB_REPOSITORY || '',
    input_name: env.INPUT_NAME,
    input_tag_name: env.INPUT_TAG_NAME?.trim(),
    input_body: env.INPUT_BODY,
    input_body_path: env.INPUT_BODY_PATH,
    input_files: parseMultiInput(env.INPUT_FILES || ''),
    input_artifacts: parseMultiInput(env.INPUT_ARTIFACTS || ''),
    input_draft: env.INPUT_DRAFT ? env.INPUT_DRAFT === 'true' : undefined,
    input_prerelease: env.INPUT_PRERELEASE
      ? env.INPUT_PRERELEASE === 'true'
      : undefined,
    input_fail_on_unmatched_files: env.INPUT_FAIL_ON_UNMATCHED_FILES === 'true',
    input_target_commitish: env.INPUT_TARGET_COMMITISH || undefined,
    input_discussion_category_name:
      env.INPUT_DISCUSSION_CATEGORY_NAME || undefined,
    input_generate_release_notes: env.INPUT_GENERATE_RELEASE_NOTES !== 'false',
    input_append_body: env.INPUT_APPEND_BODY === 'true'
  }
}

export const isTag = (ref: string): boolean => {
  return ref.startsWith('refs/tags/')
}
