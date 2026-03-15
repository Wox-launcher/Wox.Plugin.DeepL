import { ActionContext, Context, FormActionContext, Plugin, PluginInitParams, PublicAPI, Query, Result, ResultAction, UpdatableResult } from "@wox-launcher/wox-plugin"
import { PluginSettingValueSelect } from "@wox-launcher/wox-plugin/types/setting"
import * as deepl from "deepl-node"

let api: PublicAPI
let translator: deepl.Translator | undefined

const DEFAULT_LANGUAGE_A: deepl.TargetLanguageCode = "en-US"
const DEFAULT_LANGUAGE_B: deepl.TargetLanguageCode = "zh"

let languageA: deepl.TargetLanguageCode = DEFAULT_LANGUAGE_A
let languageB: deepl.TargetLanguageCode = DEFAULT_LANGUAGE_B
const TARGET_LANGUAGE_OPTIONS: Array<{ Label: string; Value: deepl.TargetLanguageCode }> = [
  { Label: "Bulgarian (bg)", Value: "bg" },
  { Label: "Czech (cs)", Value: "cs" },
  { Label: "Danish (da)", Value: "da" },
  { Label: "German (de)", Value: "de" },
  { Label: "Greek (el)", Value: "el" },
  { Label: "Spanish (es)", Value: "es" },
  { Label: "Estonian (et)", Value: "et" },
  { Label: "Finnish (fi)", Value: "fi" },
  { Label: "French (fr)", Value: "fr" },
  { Label: "Hungarian (hu)", Value: "hu" },
  { Label: "Indonesian (id)", Value: "id" },
  { Label: "Italian (it)", Value: "it" },
  { Label: "Japanese (ja)", Value: "ja" },
  { Label: "Korean (ko)", Value: "ko" },
  { Label: "Lithuanian (lt)", Value: "lt" },
  { Label: "Latvian (lv)", Value: "lv" },
  { Label: "Norwegian Bokmal (nb)", Value: "nb" },
  { Label: "Dutch (nl)", Value: "nl" },
  { Label: "Polish (pl)", Value: "pl" },
  { Label: "Romanian (ro)", Value: "ro" },
  { Label: "Russian (ru)", Value: "ru" },
  { Label: "Slovak (sk)", Value: "sk" },
  { Label: "Slovenian (sl)", Value: "sl" },
  { Label: "Swedish (sv)", Value: "sv" },
  { Label: "Turkish (tr)", Value: "tr" },
  { Label: "Ukrainian (uk)", Value: "uk" },
  { Label: "Chinese (zh)", Value: "zh" },
  { Label: "English (UK) (en-GB)", Value: "en-GB" },
  { Label: "English (US) (en-US)", Value: "en-US" },
  { Label: "Portuguese (Brazil) (pt-BR)", Value: "pt-BR" },
  { Label: "Portuguese (Portugal) (pt-PT)", Value: "pt-PT" }
]

function formatI18n(template: string, params?: Record<string, string>): string {
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`)
}

async function t(ctx: Context, key: string, params?: Record<string, string>): Promise<string> {
  let template = key
  try {
    const translated = await api.GetTranslation(ctx, key)
    if (translated !== "") {
      template = translated
    }
  } catch (_) {
    template = key
  }
  return formatI18n(template, params)
}

function getLanguageFamily(code: string): string {
  return deepl.nonRegionalLanguageCode(code).toLowerCase()
}

type ScriptFamily = "cjk" | "kana" | "hangul" | "cyrillic" | "greek" | "latin" | null

const LANGUAGE_SCRIPT_MAP: Record<string, ScriptFamily> = {
  zh: "cjk",
  ja: "kana",
  ko: "hangul",
  ru: "cyrillic",
  uk: "cyrillic",
  bg: "cyrillic",
  el: "greek",
  en: "latin",
  de: "latin",
  fr: "latin",
  es: "latin",
  pt: "latin",
  it: "latin",
  nl: "latin",
  da: "latin",
  sv: "latin",
  nb: "latin",
  fi: "latin",
  et: "latin",
  lt: "latin",
  lv: "latin",
  pl: "latin",
  cs: "latin",
  sk: "latin",
  sl: "latin",
  ro: "latin",
  hu: "latin",
  id: "latin",
  tr: "latin"
}

function getScriptForLanguage(langFamily: string): ScriptFamily {
  return LANGUAGE_SCRIPT_MAP[langFamily] ?? null
}

function detectScriptFamily(text: string): ScriptFamily {
  let cjk = 0,
    latin = 0,
    cyrillic = 0,
    hangul = 0,
    kana = 0,
    greek = 0,
    total = 0

  for (const char of text) {
    const code = char.codePointAt(0)!
    if (/\s/.test(char)) continue
    total++
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0xf900 && code <= 0xfaff)) cjk++
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) kana++
    else if (code >= 0xac00 && code <= 0xd7af) hangul++
    else if (code >= 0x0400 && code <= 0x04ff) cyrillic++
    else if (code >= 0x0370 && code <= 0x03ff) greek++
    else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) latin++
  }

  if (total === 0) return null

  // Japanese: mix of CJK + Kana
  if (kana > 0 && (kana + cjk) / total > 0.3) return "kana"
  if (cjk / total > 0.3) return "cjk"
  if (hangul / total > 0.3) return "hangul"
  if (cyrillic / total > 0.3) return "cyrillic"
  if (greek / total > 0.3) return "greek"
  if (latin / total > 0.5) return "latin"

  return null
}

function normalizeForCompare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:()"'\[\]{}<>`~@#$%^&*+=|\\/，。！？；：（）【】《》、“”‘’]/g, "")
    .replace(/\s+/g, " ")
}

function isLikelyUnchangedText(input: string, output: string): boolean {
  return normalizeForCompare(input) === normalizeForCompare(output)
}

function textSimilarity(input: string, output: string): number {
  const a = normalizeForCompare(input)
  const b = normalizeForCompare(output)
  if (a === b) {
    return 1
  }
  if (a.length === 0 || b.length === 0) {
    return 0
  }
  if (a.length < 2 || b.length < 2) {
    return 0
  }

  const aBigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2)
    aBigrams.set(gram, (aBigrams.get(gram) ?? 0) + 1)
  }

  const bBigrams = new Map<string, number>()
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2)
    bBigrams.set(gram, (bBigrams.get(gram) ?? 0) + 1)
  }

  let overlap = 0
  aBigrams.forEach((aCount, gram) => {
    const bCount = bBigrams.get(gram) ?? 0
    overlap += Math.min(aCount, bCount)
  })

  return (2 * overlap) / (a.length - 1 + (b.length - 1))
}

async function loadLanguageSettings(ctx: Context) {
  const settingLanguageA = (await api.GetSetting(ctx, "languageA")).trim()
  const settingLanguageB = (await api.GetSetting(ctx, "languageB")).trim()

  languageA = (settingLanguageA === "" ? DEFAULT_LANGUAGE_A : settingLanguageA) as deepl.TargetLanguageCode
  languageB = (settingLanguageB === "" ? DEFAULT_LANGUAGE_B : settingLanguageB) as deepl.TargetLanguageCode
}

async function translateWithTarget(ctx: Context, actionContext: ActionContext, text: string, targetLanguage: deepl.TargetLanguageCode, copyActionName: string) {
  if (!translator) {
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Preview: {
        PreviewType: "text",
        PreviewData: await t(ctx, "msg_api_key_not_set"),
        PreviewProperties: {}
      }
    } as UpdatableResult)
    return
  }

  const queryText = text.trim()
  if (queryText === "") {
    return
  }

  await api.UpdateResult(ctx, {
    Id: actionContext.ResultId,
    Preview: {
      PreviewType: "text",
      PreviewData: await t(ctx, "msg_translating"),
      PreviewProperties: {}
    }
  } as UpdatableResult)

  try {
    const translated = await translator.translateText(queryText, null, targetLanguage)
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Preview: {
        PreviewType: "text",
        PreviewData: translated.text,
        PreviewProperties: {}
      },
      Actions: [
        {
          Name: copyActionName,
          Action: async () => {
            await api.Copy(ctx, {
              type: "text",
              text: translated.text
            })
          }
        }
      ]
    } as UpdatableResult)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Preview: {
        PreviewType: "text",
        PreviewData: await t(ctx, "msg_translation_failed", {
          errorMessage
        }),
        PreviewProperties: {}
      }
    } as UpdatableResult)
  }
}

async function getTranslateAction(ctxForTranslation: Context, rawText: string) {
  const translateActionName = await t(ctxForTranslation, "action_translate")
  const translateWithTargetActionName = await t(ctxForTranslation, "action_translate_with_target")
  const copyActionName = await t(ctxForTranslation, "action_copy")
  const targetLanguageLabel = await t(ctxForTranslation, "form_target_language_label")

  const actions: ResultAction[] = [
    {
      Name: translateActionName,
      PreventHideAfterAction: true,
      Action: async (ctx: Context, actionContext: ActionContext) => {
        if (!translator) {
          await api.UpdateResult(ctx, {
            Id: actionContext.ResultId,
            Preview: {
              PreviewType: "text",
              PreviewData: await t(ctx, "msg_api_key_not_set"),
              PreviewProperties: {}
            }
          } as UpdatableResult)
          return
        }

        const text = rawText.trim()
        if (text === "") {
          return
        }

        const familyA = getLanguageFamily(languageA)
        const familyB = getLanguageFamily(languageB)
        if (familyA === familyB) {
          await api.UpdateResult(ctx, {
            Id: actionContext.ResultId,
            Preview: {
              PreviewType: "text",
              PreviewData: await t(ctx, "msg_invalid_language_pair", {
                languageA,
                languageB
              }),
              PreviewProperties: {}
            }
          } as UpdatableResult)
          return
        }

        await api.UpdateResult(ctx, {
          Id: actionContext.ResultId,
          Preview: {
            PreviewType: "text",
            PreviewData: await t(ctx, "msg_translating"),
            PreviewProperties: {}
          }
        } as UpdatableResult)

        try {
          // Try to determine translation direction locally via script detection
          // to avoid a wasted API call when both languages use different scripts
          const detectedScript = detectScriptFamily(text)
          const scriptA = getScriptForLanguage(familyA)
          const scriptB = getScriptForLanguage(familyB)
          const canDetectLocally = detectedScript !== null && scriptA !== scriptB && (detectedScript === scriptA || detectedScript === scriptB)

          let translatedText = ""
          if (canDetectLocally) {
            // Single API call: we know the direction from local script analysis
            api.Log(ctx, "Info", "detect translation direction locally via script analysis: detectedScript=" + detectedScript)
            const targetLanguage = detectedScript === scriptA ? languageB : languageA
            const result = await translator.translateText(text, null, targetLanguage)
            translatedText = result.text
          } else {
            // Fallback: can't determine locally (same script or unknown),
            // use DeepL's language detection
            const toLanguageA = await translator.translateText(text, null, languageA)
            const detectedFamily = getLanguageFamily(toLanguageA.detectedSourceLang)

            if (detectedFamily === familyB) {
              translatedText = toLanguageA.text
            } else if (detectedFamily === familyA) {
              const toLanguageB = await translator.translateText(text, null, languageB)
              translatedText = toLanguageB.text
            } else {
              // DeepL language detection may be noisy for short text. Try both directions and
              // use the side that is likely unchanged as the source language.
              const toLanguageB = await translator.translateText(text, null, languageB)
              const unchangedToA = isLikelyUnchangedText(text, toLanguageA.text)
              const unchangedToB = isLikelyUnchangedText(text, toLanguageB.text)

              if (unchangedToA && !unchangedToB) {
                translatedText = toLanguageB.text
              } else if (unchangedToB && !unchangedToA) {
                translatedText = toLanguageA.text
              } else {
                const similarityToA = textSimilarity(text, toLanguageA.text)
                const similarityToB = textSimilarity(text, toLanguageB.text)
                const similarityGap = Math.abs(similarityToA - similarityToB)

                if (similarityGap >= 0.12) {
                  translatedText = similarityToA < similarityToB ? toLanguageA.text : toLanguageB.text
                } else {
                  await api.UpdateResult(ctx, {
                    Id: actionContext.ResultId,
                    Preview: {
                      PreviewType: "text",
                      PreviewData: await t(ctx, "msg_only_pair_supported", {
                        detectedSourceLang: toLanguageA.detectedSourceLang,
                        languageA,
                        languageB
                      }),
                      PreviewProperties: {}
                    }
                  } as UpdatableResult)
                  return
                }
              }
            }
          }

          await api.UpdateResult(ctx, {
            Id: actionContext.ResultId,
            Preview: {
              PreviewType: "text",
              PreviewData: translatedText,
              PreviewProperties: {}
            },
            Actions: [
              {
                Name: copyActionName,
                Action: async () => {
                  await api.Copy(ctx, {
                    type: "text",
                    text: translatedText
                  })
                }
              }
            ]
          } as UpdatableResult)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          await api.UpdateResult(ctx, {
            Id: actionContext.ResultId,
            Preview: {
              PreviewType: "text",
              PreviewData: await t(ctx, "msg_translation_failed", {
                errorMessage
              }),
              PreviewProperties: {}
            }
          } as UpdatableResult)
        }
      }
    }
  ]

  actions.push({
    Type: "form",
    Name: translateWithTargetActionName,
    PreventHideAfterAction: true,
    Form: [
      {
        Type: "select",
        Value: {
          Key: "targetLanguage",
          Label: targetLanguageLabel,
          DefaultValue: languageB,
          Options: TARGET_LANGUAGE_OPTIONS
        } as PluginSettingValueSelect,
        DisabledInPlatforms: [],
        IsPlatformSpecific: false
      }
    ],
    OnSubmit: async (ctx: Context, formContext: FormActionContext) => {
      const targetLanguage = (formContext.Values["targetLanguage"] || languageB) as deepl.TargetLanguageCode
      await translateWithTarget(ctx, formContext, rawText, targetLanguage, copyActionName)
    }
  })

  return actions
}

export const plugin: Plugin = {
  init: async (ctx: Context, params: PluginInitParams) => {
    api = params.API

    const authKey = await api.GetSetting(ctx, "key")
    if (authKey !== "") {
      translator = new deepl.Translator(authKey)
    } else {
      await api.Log(ctx, "Warning", await t(ctx, "log_set_api_key_in_settings"))
    }

    await loadLanguageSettings(ctx)

    await api.OnSettingChanged(ctx, async (ctx: Context, key: string, value: string) => {
      if (key === "key") {
        if (value.trim() === "") {
          translator = undefined
          await api.Log(ctx, "Warning", await t(ctx, "log_api_key_cleared"))
        } else {
          await api.Log(ctx, "Info", await t(ctx, "log_api_key_changed"))
          translator = new deepl.Translator(value)
        }
      }

      if (key === "languageA" || key === "languageB") {
        if (key === "languageA") {
          languageA = (value.trim() === "" ? DEFAULT_LANGUAGE_A : value.trim()) as deepl.TargetLanguageCode
        } else {
          languageB = (value.trim() === "" ? DEFAULT_LANGUAGE_B : value.trim()) as deepl.TargetLanguageCode
        }
        await api.Log(ctx, "Info", await t(ctx, "log_setting_changed", { key }))
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
          Title: await t(ctx, "msg_api_key_not_set"),
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Preview: {
            PreviewType: "text",
            PreviewData: await t(ctx, "msg_set_api_key_in_settings"),
            PreviewProperties: {}
          }
        }
      ]
    }

    const queryText = query.Type === "input" ? query.Search : query.Selection.Text
    const actions = await getTranslateAction(ctx, queryText)
    return [
      {
        Title: await t(ctx, "result_title_translate"),
        Tails: [
          {
            Type: "text",
            Text: await t(ctx, "translate_between", {
              languageA,
              languageB
            })
          }
        ],
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "text",
          PreviewData: queryText,
          PreviewProperties: {}
        },
        Actions: actions
      }
    ]
  }
}
