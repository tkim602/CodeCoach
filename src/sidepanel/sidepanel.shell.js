export function mountSiderChatPanel({ elements, documentRef = document }) {
  const coachView = elements.coachView;
  const hero = documentRef.querySelector(".coach-hero");
  const transcriptPanel = documentRef.querySelector(".chat-transcript-panel");
  const transcript = elements.coachChatTranscript;
  const composer = documentRef.querySelector(".coach-composer");
  if (!coachView || !hero || !transcriptPanel || !transcript || !composer) return null;

  let chatPanel = documentRef.querySelector(".coach-chat-panel");
  if (!chatPanel) {
    chatPanel = documentRef.createElement("section");
    chatPanel.className = "coach-chat-panel";
    coachView.insertBefore(chatPanel, coachView.firstElementChild);
  }

  if (!transcript.contains(hero)) {
    transcript.insertBefore(hero, transcript.firstElementChild);
  }
  if (!chatPanel.contains(transcriptPanel)) {
    chatPanel.appendChild(transcriptPanel);
  }
  if (!chatPanel.contains(composer)) {
    chatPanel.appendChild(composer);
  }
  return chatPanel;
}
