import type { ProviderPreset } from '../../shared/types'

/** 全部走 OpenAI 兼容协议，差别只在 baseUrl 与模型名 */
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-reasoner', 'deepseek-chat'],
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4.5', 'glm-4-plus'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  {
    id: 'qwen',
    label: '阿里通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen3-max'],
    keyUrl: 'https://bailian.console.aliyun.com/'
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'moonshot-v1-128k'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini'],
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
    keyUrl: ''
  }
]

export function findProvider(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id)
}
