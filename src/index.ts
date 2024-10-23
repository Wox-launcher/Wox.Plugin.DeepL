import { Context, Plugin, PluginInitParams, PublicAPI, Query, RefreshableResult, Result } from "@wox-launcher/wox-plugin"
import * as deepl from "deepl-node"
import clipboard from "clipboardy"

let api: PublicAPI
let translator: deepl.Translator

function containsChinese(str: string) {
  return /[\u4E00-\u9FA5]/.test(str)
}

function queryForInput(query: Query): Result[] {
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
        let targetLang = "zh"
        if (containsChinese(query.Search)) {
          targetLang = "en-US"
        }
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

function queryForSelection(query: Query): Result[] {
  let translateResult = ""
  let translateStartTime = 0
  return [
    {
      Title: "DeepL Translate",
      Icon: {
        ImageType: "relative",
        ImageData: "images/app.png"
      },
      Preview: {
        PreviewType: "markdown",
        PreviewData: `${query.Selection.Text}`,
        PreviewProperties: {}
      },
      RefreshInterval: 200,
      OnRefresh: async (result: RefreshableResult) => {
        if (translateResult === "") {
          if (translateStartTime > 0) {
            // still translating
            result.SubTitle = "Translating..."
          }
          return result
        }

        result.SubTitle = "Translated, took " + (Date.now() - translateStartTime) + "ms"
        result.Preview.PreviewData = `${translateResult}  
---  

${query.Selection.Text}`
        result.RefreshInterval = 0 // stop refreshing
        result.Actions = [
          {
            Name: "Copy",
            Action: async () => {
              await clipboard.write(translateResult)
            }
          }
        ]

        return result
      },
      Actions: [
        {
          Name: "Translate",
          PreventHideAfterAction: true,
          Action: async () => {
            translateStartTime = Date.now()

            let targetLang = "zh"
            if (containsChinese(query.Selection.Text)) {
              targetLang = "en-US"
            }
            const newResult = await translator.translateText(query.Selection.Text, null, <deepl.TargetLanguageCode>targetLang)
            translateResult = newResult.text
          }
        }
      ]
    }
  ]
}

export const plugin: Plugin = {
  init: async (ctx: Context, params: PluginInitParams) => {
    api = params.API

    const authKey = await api.GetSetting(ctx, "key")
    if (authKey !== "") {
      translator = new deepl.Translator(authKey)
    } else {
      await api.Log(ctx, "Warning", "Please set the DeepL API key in the settings")
    }

    await api.OnSettingChanged(ctx, async (key: string, value: string) => {
      if (key === "key") {
        await api.Log(ctx, "Info", "DeepL API key changed")
        translator = new deepl.Translator(value)
      }
    })
  },
  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    if (query.Type === "input" && query.Search === "") {
      return []
    }
    if (query.Type === "selection" && query.Selection.Text === "") {
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

    if (query.Type === "input") {
      return queryForInput(query)
    }
    if (query.Type === "selection") {
      return queryForSelection(query)
    }

    return []
  }
}
