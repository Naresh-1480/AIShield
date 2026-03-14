// Check backend status
async function checkBackend() {
  try {
    const res = await fetch("http://localhost:3000/api/stats");
    if (res.ok) {
      document.getElementById("statusDot").classList.remove("off");
      document.getElementById("statusText").textContent = "Proxy Active ✓";
    }
  } catch {
    document.getElementById("statusDot").classList.add("off");
    document.getElementById("statusText").textContent = "Backend Offline";
  }
}

// Load saved department
chrome.storage.sync.get(["department"], (result) => {
  if (result.department) {
    document.getElementById("department").value = result.department;
  }
});

// Save settings
document.getElementById("saveBtn").onclick = () => {
  const dept = document.getElementById("department").value;
  chrome.storage.sync.set({ department: dept }, () => {
    document.getElementById("saveBtn").textContent = "Saved! ✓";
    setTimeout(() => {
      document.getElementById("saveBtn").textContent = "Save Settings";
    }, 1500);
  });
};

// Open dashboard
document.getElementById("dashboardBtn").onclick = () => {
  chrome.tabs.create({ url: "http://localhost:5173" });
};

checkBackend();
