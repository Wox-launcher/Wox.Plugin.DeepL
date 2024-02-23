import type { Plugin, PluginInitContext, PublicAPI, Query, Result } from "@wox-launcher/wox-plugin"
import * as deepl from "deepl-node"

let api: PublicAPI
let translator: deepl.Translator

function containsChinese(str: string) {
  return /[\u4E00-\u9FA5]/.test(str)
}

export const plugin: Plugin = {
  init: async (context: PluginInitContext) => {
    api = context.API

    const authKey = await api.GetSetting("key")
    if (authKey !== "") {
      translator = new deepl.Translator(authKey)
    } else {
      await api.Log("Warning", "Please set the DeepL API key in the settings")
    }

    await api.OnSettingChanged(async (key: string, value: string) => {
      if (key === "key") {
        await api.Log("Info", "DeepL API key changed")
        translator = new deepl.Translator(value)
      }
    })
  },
  query: async (query: Query): Promise<Result[]> => {
    if (query.Search === "") {
      return []
    }
    if (!translator) {
      return [
        {
          Title: "DeepL API key not set",
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Preview: {
            PreviewType: "text",
            PreviewData: "Please set the DeepL API key in the settings",
            PreviewProperties: {}
          }
        }
      ]
    }

    let targetLang = "zh"
    if (containsChinese(query.Search)) {
      targetLang = "en-US"
    }

    const result = await translator.translateText(query.Search, null, <deepl.TargetLanguageCode>targetLang)

    return [
      {
        Title: query.Search,
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "text",
          PreviewData: result.text,
          PreviewProperties: {}
        },
        Actions: [
          {
            Name: "Copy",
            Action: async () => {
            }
          }
        ]
      }
    ]
  }
}
