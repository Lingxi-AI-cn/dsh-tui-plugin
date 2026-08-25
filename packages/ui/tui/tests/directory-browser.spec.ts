import { describe, expect, it } from 'vitest'
import { projectTuiDirectoryBrowser } from '../src/index.ts'

describe('native TUI bounded directory browser', () => {
  it('uses owner-provided absolute paths, filters hidden rows, and preserves parent/home facts', () => {
    const listing = {
      path: '/home/user/projects',
      home: '/home/user',
      crumbs: [
        { name: '/', path: '/', hidden: false },
        { name: 'home', path: '/home', hidden: false },
        { name: 'user', path: '/home/user', hidden: false },
        { name: 'projects', path: '/home/user/projects', hidden: false },
      ],
      entries: [
        { name: '.private', path: '/home/user/projects/.private', hidden: true },
        { name: 'project', path: '/home/user/projects/project', hidden: false },
      ],
      truncated: true,
    }
    expect(projectTuiDirectoryBrowser(listing, false)).toEqual({
      path: '/home/user/projects',
      home: '/home/user',
      parent: '/home/user',
      rows: [
        { kind: 'select-current', name: '/home/user/projects', path: '/home/user/projects', hidden: false },
        { kind: 'directory', name: 'project', path: '/home/user/projects/project', hidden: false },
      ],
      truncated: true,
    })
    expect(projectTuiDirectoryBrowser(listing, true).rows).toHaveLength(3)
  })
})
