const form = document.getElementById("leadForm");
const statusEl = document.getElementById("formStatus");
const dialog = document.getElementById("leadDialog");
const formTitle = document.getElementById("formTitle");
const selectedBrochureLabel = document.getElementById("selectedBrochureLabel");
const closeForm = document.getElementById("closeForm");
const cancelForm = document.getElementById("cancelForm");

let pendingDownloadPath = "";

document.querySelectorAll("[data-file]").forEach((button) => {
  button.addEventListener("click", () => {
    pendingDownloadPath = button.getAttribute("data-file") || "";
    const title = button.getAttribute("data-title") || "Selected Brochure";

    formTitle.textContent = `Contact Form - ${title}`;
    selectedBrochureLabel.value = title;
    statusEl.textContent = "";

    if (!dialog.open) {
      dialog.showModal();
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    statusEl.textContent = "Please complete all required fields.";
    return;
  }

  if (!pendingDownloadPath) {
    statusEl.textContent = "Please select a brochure first.";
    return;
  }

  const data = new FormData(form);
  const payload = {
    fullName: data.get("fullName"),
    companyName: data.get("companyName"),
    email: data.get("email"),
    phone: data.get("phone"),
    brochureTitle: selectedBrochureLabel.value,
    brochureFile: pendingDownloadPath,
  };

  try {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let serverMessage = "Unable to save details. Please try again.";
      try {
        const body = await response.json();
        if (body && body.message) {
          serverMessage = body.message;
        }
      } catch (error) {
        // Keep default message if response body is not JSON.
      }
      statusEl.textContent = serverMessage;
      return;
    }

    statusEl.textContent = "Submitted successfully. Download is starting...";
    triggerDownload(pendingDownloadPath);
  } catch (error) {
    statusEl.textContent = "Server not reachable. Please run the app server.";
    return;
  }

  form.reset();
  pendingDownloadPath = "";
  setTimeout(() => dialog.close(), 450);
});

closeForm.addEventListener("click", closeDialog);
cancelForm.addEventListener("click", closeDialog);

dialog.addEventListener("click", (event) => {
  const bounds = dialog.getBoundingClientRect();
  const clickedOutside =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;

  if (clickedOutside) {
    closeDialog();
  }
});

function closeDialog() {
  form.reset();
  statusEl.textContent = "";
  pendingDownloadPath = "";
  dialog.close();
}

function triggerDownload(path) {
  const fileName = String(path || "").trim();
  if (!fileName) {
    statusEl.textContent = "No brochure selected.";
    return;
  }

  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = `/download/${encodeURIComponent(fileName)}`;
  document.body.appendChild(frame);

  setTimeout(() => frame.remove(), 60000);
}
