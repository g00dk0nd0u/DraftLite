const draftList = document.getElementById("draftList");
const status = document.getElementById("status");
const primaryAction = document.getElementById("primaryAction");
const secondaryAction = document.getElementById("secondaryAction");

const drafts = [
  {
    title: "Title block",
    body: "Keep the opening line short and immediately useful.",
  },
  {
    title: "Structure",
    body: "Break ideas into a few clear parts before polishing the wording.",
  },
];

function renderDrafts() {
  draftList.innerHTML = "";

  drafts.forEach((draft) => {
    const item = document.createElement("li");
    item.className = "draft-item";
    item.innerHTML = `<strong>${draft.title}</strong><p>${draft.body}</p>`;
    draftList.appendChild(item);
  });
}

function setStatus(message) {
  status.textContent = message;
}

primaryAction.addEventListener("click", () => {
  const count = drafts.length + 1;
  drafts.unshift({
    title: `Draft ${count}`,
    body: "A new note was added to the working set.",
  });
  renderDrafts();
  setStatus("Note added");
});

secondaryAction.addEventListener("click", () => {
  drafts.sort((a, b) => a.title.localeCompare(b.title, "ja"));
  renderDrafts();
  setStatus("Sorted");
});

renderDrafts();
