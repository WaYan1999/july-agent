import { FormTypeEnum } from '@/app/components/header/account-setting/model-provider-page/declarations'

export const NAME_FIELD = {
  type: FormTypeEnum.textInput,
  name: 'name',
  label: {
    en_US: 'Endpoint Name',
    zh_Hans: '端点名称',
  },
  placeholder: {
    en_US: 'Endpoint Name',
    zh_Hans: '端点名称',
  },
  required: true,
  default: '',
  help: null,
}
