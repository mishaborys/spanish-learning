/** Озвучити іспанське слово синтезатором браузера. Тільки на клік — автоозвучення в застосунку немає. */
export function speakSpanish(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES";
  u.rate = 0.8;
  window.speechSynthesis.speak(u);
}
