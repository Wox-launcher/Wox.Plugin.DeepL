import { Plugin, PluginInitContext, PublicAPI, Query, RefreshableResult, Result } from "@wox-launcher/wox-plugin"
import * as deepl from "deepl-node"
import clipboard from "clipboardy"

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

    let translateResult = ""

    return [
      {
        Title: query.Search,
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "text",
          PreviewData: "Translating...",
          PreviewProperties: {}
        },
        RefreshInterval: 200,
        OnRefresh: async (result: RefreshableResult) => {
          const newResult = await translator.translateText(query.Search, null, <deepl.TargetLanguageCode>targetLang)
          translateResult = newResult.text
          result.Preview.PreviewData = translateResult
          result.RefreshInterval = 0 // stop refreshing
          return result
        },
        Actions: [
          {
            Name: "Copy",
            Action: async () => {
              await clipboard.write(translateResult)
            }
          }
        ]
      }
    ]
  }
}
