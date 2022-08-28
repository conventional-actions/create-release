import * as assert from 'assert'
import {mimeOrDefault, asset, release} from '../src/github'
import * as github from '@actions/github'

describe('github', () => {
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
