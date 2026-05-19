const form = document.getElementById("leadForm");
const statusEl = document.getElementById("formStatus");
const dialog = document.getElementById("leadDialog");
const formTitle = document.getElementById("formTitle");
const selectedBrochureLabel = document.getElementById("selectedBrochureLabel");
const closeForm = document.getElementById("closeForm");
const cancelForm = document.getElementById("cancelForm");
const allBrochureDownloads = [
  "acceluav-flyers.pdf",
  "acceluav-profile.pdf",
];
const allBrochureLabel = "AccelUAV Flyers + AccelUAV Profile";

let pendingDownloadPath = "";

document.querySelectorAll("[data-file]").forEach((button) => {
  button.addEventListener("click", async () => {
    pendingDownloadPath = button.getAttribute("data-file") || "";

    const hasAccess = await checkBrochureAccess();
    if (hasAccess) {
      triggerDownload(pendingDownloadPath);
      return;
    }

    openDialogForBrochure();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    statusEl.textContent = "Please complete all required fields.";
    return;
  }

  const data = new FormData(form);
  const payload = {
    fullName: data.get("fullName"),
    companyName: data.get("companyName"),
    email: data.get("email"),
    phone: data.get("phone"),
    brochureTitle: allBrochureLabel,
    brochureFile: "all-brochures",
  };

  try {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let body = {};
    try {
      body = await response.json();
    } catch (error) {
      body = {};
    }

    if (!response.ok) {
      statusEl.textContent =
        body.message || "We could not unlock brochure downloads. Please try again.";
      return;
    }

    const serverMessage = body.message || "Thanks. Your brochure access is unlocked.";
    statusEl.textContent = `${serverMessage} Both downloads are starting...`;
    triggerDownloads(allBrochureDownloads);
  } catch (error) {
    statusEl.textContent = "We could not unlock brochure downloads. Please try again.";
    return;
  }

  form.reset();
  selectedBrochureLabel.value = "";
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
  selectedBrochureLabel.value = "";
  pendingDownloadPath = "";
  if (dialog.open) {
    dialog.close();
  }
}

function openDialogForBrochure() {
  formTitle.textContent = "Contact Form - Download Both Brochures";
  selectedBrochureLabel.value = allBrochureLabel;
  statusEl.textContent = "";

  if (!dialog.open) {
    dialog.showModal();
  }
}

async function checkBrochureAccess() {
  try {
    const response = await fetch("/api/brochure-access", {
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const body = await response.json();
    return Boolean(body.granted);
  } catch (error) {
    return false;
  }
}

function triggerDownload(path) {
  const fileName = String(path || "").trim();
  if (!fileName) {
    statusEl.textContent = "No brochure selected.";
    return;
  }

  const downloadUrl = `/download/${encodeURIComponent(fileName)}`;
  window.location.assign(downloadUrl);
}

function triggerDownloads(paths) {
  const validPaths = Array.isArray(paths)
    ? paths.map((path) => String(path || "").trim()).filter(Boolean)
    : [];

  if (!validPaths.length) {
    statusEl.textContent = "No brochures selected.";
    return;
  }

  validPaths.forEach((fileName, index) => {
    window.setTimeout(() => {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      frame.src = `/download/${encodeURIComponent(fileName)}`;
      document.body.appendChild(frame);

      window.setTimeout(() => {
        frame.remove();
      }, 8000);
    }, index * 500);
  });
}
