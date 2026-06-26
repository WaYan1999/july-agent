export type SkillTaxonomy = {
  id?: string | null
  slug: string
  name: string
}

export type SkillVersion = {
  id?: string | null
  content_type?: 'zip_package' | 'markdown_file' | 'remote_reference' | string | null
  skill_markdown?: string | null
  package_filename?: string | null
  package_size?: number | null
  checksum_sha256?: string | null
  is_latest?: boolean | null
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type Skill = {
  id: string
  slug: string
  name: string
  description: string
  author_name?: string | null
  source_type?: 'github' | 'official' | 'site' | 'other' | string | null
  source_url?: string | null
  install_command?: string | null
  icon?: string | null
  icon_background?: string | null
  icon_url?: string | null
  publication_status?: string | null
  audit_status?: string | null
  audit_notes?: string | null
  categories: SkillTaxonomy[]
  tags: SkillTaxonomy[]
  install_count: number
  github_stars: number
  position: number
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  latest_version?: SkillVersion | null
}

export type SkillPagination = {
  data: Skill[]
  filters?: {
    categories?: SkillTaxonomy[]
    tags?: SkillTaxonomy[]
  }
  has_more: boolean
  limit: number
  page: number
  total: number
}

export type SkillListParams = {
  page?: number
  limit?: number
  keyword?: string
  category?: string
  tag?: string
  source_type?: string
  content_type?: string
  audit_status?: string
  sort?: string
}
