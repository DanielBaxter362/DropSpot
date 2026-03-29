const notesList = document.getElementById("notes-list");
const usernameInput = document.getElementById("username");


function returnToHome() {
  window.location.href = "/home";
}


function saveUsername() {
  window.alert("Username changes are not wired yet.");
}


function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function buildNoteTitle(content) {
  const cleaned = String(content || "").trim().replace(/\s+/g, " ");

  if (!cleaned) {
    return "Untitled note";
  }

  return cleaned.length <= 36 ? cleaned : `${cleaned.slice(0, 36).trimEnd()}...`;
}


async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}


async function loadAccount() {
  try {
    const data = await requestJson("/api/account");
    usernameInput.value = data.username || "";
  } catch (error) {
    window.alert(error.message);
  }
}


function renderNotes(notes) {
  if (!notes.length) {
    notesList.innerHTML = `
      <div class="notes-empty">
        No spots yet.<br>
        Add one from the map and it will show up here.
      </div>
    `;
    return;
  }

  notesList.innerHTML = notes.map((note) => `
    <div class="note-item" data-note-id="${note.noteID}">
      <div class="note-item-header">
        <div>
          <div class="popup-title">${escapeHtml(note.title || buildNoteTitle(note.content))}</div>
          <div class="note-item-meta">
            <span>${note.latitude?.toFixed(5) || "?"}, ${note.longitude?.toFixed(5) || "?"}</span>
            <span>${note.hotspot ? "Hotspot" : "Normal spot"}</span>
          </div>
        </div>
        <div class="note-item-actions">
          <button class="btn-sm" onclick="openEditNote(${note.noteID})">Edit</button>
          <button class="btn-sm danger" onclick="deleteNote(${note.noteID})">Delete</button>
        </div>
      </div>
      <div class="note-item-text" id="note-text-${note.noteID}">${escapeHtml(note.description || note.content)}</div>
      <div class="note-edit-area" id="note-edit-${note.noteID}">
        <label class="field-label">Title</label>
        <input class="field-input" id="note-title-${note.noteID}" type="text" value="${escapeHtml(note.title || "")}" style="margin-bottom:0;">
        <label class="field-label">Description</label>
        <textarea class="field-textarea" id="note-description-${note.noteID}" style="height:90px;margin-bottom:0;">${escapeHtml(note.description || "")}</textarea>
        <div class="note-item-actions">
          <button class="btn-sm confirm" onclick="saveNoteEdit(${note.noteID})">Save</button>
          <button class="btn-sm" onclick="closeEditNote(${note.noteID})">Cancel</button>
        </div>
      </div>
    </div>
  `).join("");
}


async function loadNotes() {
  notesList.innerHTML = `<div class="notes-empty">Loading your spots...</div>`;

  try {
    const data = await requestJson("/api/my-spots");
    renderNotes(data.notes || []);
  } catch (error) {
    notesList.innerHTML = `<div class="notes-empty">${escapeHtml(error.message)}</div>`;
  }
}


function openEditNote(noteID) {
  document.getElementById(`note-edit-${noteID}`)?.classList.add("open");
}


function closeEditNote(noteID) {
  document.getElementById(`note-edit-${noteID}`)?.classList.remove("open");
}


async function saveUsername() {
  const username = usernameInput?.value.trim() || "";

  if (!username) {
    window.alert("Username cannot be empty.");
    return;
  }

  try {
    await requestJson("/api/account/username", {
      method: "PUT",
      body: JSON.stringify({ username })
    });
    window.alert("Username updated.");
  } catch (error) {
    window.alert(error.message);
  }
}


async function saveNoteEdit(noteID) {
  const titleInput = document.getElementById(`note-title-${noteID}`);
  const descriptionInput = document.getElementById(`note-description-${noteID}`);
  const title = titleInput?.value.trim() || "";
  const description = descriptionInput?.value.trim() || "";

  if (!title && !description) {
    window.alert("Title or description cannot be empty.");
    return;
  }

  try {
    await requestJson(`/api/spots/${noteID}`, {
      method: "PUT",
      body: JSON.stringify({ title, description })
    });
    await loadNotes();
  } catch (error) {
    window.alert(error.message);
  }
}


async function deleteNote(noteID) {
  if (!window.confirm("Delete this spot?")) {
    return;
  }

  try {
    await requestJson(`/api/spots/${noteID}`, {
      method: "DELETE"
    });
    await loadNotes();
  } catch (error) {
    window.alert(error.message);
  }
}


window.addEventListener("DOMContentLoaded", async () => {
  await loadAccount();
  await loadNotes();
});
