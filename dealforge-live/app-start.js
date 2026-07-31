window.addEventListener("hashchange", () => {
  state.route = routeFromHash();
  state.mobileFiltersOpen = false;
  state.modal = null;
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
});

document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.modal = null;
    state.mobileFiltersOpen = false;
    render();
  }
});

boot();
