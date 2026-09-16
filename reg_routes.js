const routes = {
  auth: "/api/auth",
  market: "/api/market",
  buildings: "/api/buildings",
  skills: "/api/skills",
  interiors: "/api/interiors"
};

Object.entries(routes).forEach(([k, v]) => {
  const payload = {
    id: "shaddai-" + k,
    url: "https://localhost:3000" + v,
    platform: "custom",
    tools: ["fetch"]
  };
  // Simulate shaddai_bridge_register call via fetch to our own bridge endpoint
  // In real environment this would be done via the bridge registration API.
  console.log("Register payload for", k, payload);
});

console.log("All route registration payloads generated.");