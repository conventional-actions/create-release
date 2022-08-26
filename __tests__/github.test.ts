import * as assert from 'assert'
import {mimeOrDefault, asset, release} from '../src/github'
import {Config} from '../src/util'
import * as github from '@actions/github'
import * as core from '@actions/core'

describe('github', () => {
  it('release', () => {
    const config = {
      github_token: process.env['GITHUB_TOKEN'],
      github_repository: 'conventional-actions/create-release',
      github_ref: 'refs/heads/main',
      input_tag_name: 'v1.0.2'
    } as Config

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

    release(config, gh).then(console.log)
  })

  describe('mimeOrDefault', () => {
    it('returns a specific mime for common path', async () => {
      assert.equal(mimeOrDefault('foo.tar.gz'), 'application/gzip')
    })
    it('returns default mime for uncommon path', async () => {
      assert.equal(mimeOrDefault('foo.uncommon'), 'application/octet-stream')
    })
  })

  describe('asset', () => {
    it('derives asset info from a path', async () => {
      const {name, mime, size, data} = asset('__tests__/data/foo/bar.txt')
      assert.equal(name, 'bar.txt')
      assert.equal(mime, 'text/plain')
      assert.equal(size, 10)
      assert.equal(data.toString(), 'release me')
    })
  })
})
