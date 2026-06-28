const data = {
  languages: [
    {
      value: 'en-US',
      name: 'English (United States)',
      prompt_name: 'English',
      example: 'Hello, July!',
      supported: true,
    },
    {
      value: 'zh-Hans',
      name: '简体中文',
      prompt_name: 'Chinese Simplified',
      example: '你好，July！',
      supported: true,
    },
  ],
} as const

export default data
