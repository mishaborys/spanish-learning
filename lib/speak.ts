/** Озвучити текст синтезатором браузера. Тільки на клік — автоозвучення в застосунку немає. */
function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.8;
  window.speechSynthesis.speak(u);
}

/** Озвучити іспанське слово. */
export function speakSpanish(text: string) {
  speak(text, "es-ES");
}

/** Озвучити українське слово (напр. лицьовий бік флешкартки, коли спереду переклад). */
export function speakUkrainian(text: string) {
  speak(text, "uk-UA");
}
