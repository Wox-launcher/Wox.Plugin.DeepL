import { ActionContext, Context, Plugin, PluginInitParams, PublicAPI, Query, Result, UpdatableResult } from "@wox-launcher/wox-plugin"
import * as deepl from "deepl-node"

let api: PublicAPI
let translator: deepl.Translator

function containsChinese(str: string) {
  return /[\u4E00-\u9FA5]/.test(str)
}

function getTranslateAction(ctx: Context, txt: string) {
  return [
    {
      Name: "Translate",
      PreventHideAfterAction: true,
      Action: async (actionContext: ActionContext) => {
        let targetLang = "zh"
        if (containsChinese(txt)) {
          targetLang = "en-US"
        }

        // give user some feedback that the translation is in progress
        await api.UpdateResult(ctx, {
          Id: actionContext.ResultId,
          Preview: {
            PreviewType: "text",
            PreviewData: "Translating...",
            PreviewProperties: {}
          }
        } as UpdatableResult)

        const newResult = await translator.translateText(txt, null, <deepl.TargetLanguageCode>targetLang)

        await api.UpdateResult(ctx, {
          Id: actionContext.ResultId,
          Preview: {
            PreviewType: "text",
            PreviewData: `${newResult.text}`,
            PreviewProperties: {}
          },
          Actions: [
            {
              Name: "Copy",
              Action: async () => {
                await api.Copy(ctx, {
                  type: "text",
                  text: newResult.text
                })
              }
            }
          ]
        } as UpdatableResult)
      }
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

    const queryText = query.Type === "input" ? query.Search : query.Selection.Text
    return [
      {
        Title: "DeepL Translate",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "text",
          PreviewData: "Press Enter to translate: " + queryText,
          PreviewProperties: {}
        },
        Actions: getTranslateAction(ctx, queryText)
      }
    ]

    return []
  }
}
