import { validateReferenceImageFiles } from "./image-utils.js";

export function createReferenceImagePicker({ input, dropzone, list, clearButton, pasteTarget, onChange, onError }) {
  let items = [];
  let disabled = false;

  input.addEventListener("change", () => {
    addFiles(input.files);
    input.value = "";
  });
  clearButton.addEventListener("click", clear);
  pasteTarget.addEventListener("paste", (event) => addFiles(event.clipboardData?.files));
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    addFiles(event.dataTransfer?.files);
  });

  function addFiles(fileList) {
    if (disabled) return;
    const known = new Set(items.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
    const incoming = Array.from(fileList || []).filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if (!incoming.length) return;

    try {
      validateReferenceImageFiles([...items.map(({ file }) => file), ...incoming]);
    } catch (error) {
      onError(error.message);
      return;
    }

    items.push(...incoming.map((file) => ({ file, url: URL.createObjectURL(file) })));
    render();
    onChange(items.length);
  }

  function remove(index) {
    URL.revokeObjectURL(items[index].url);
    items.splice(index, 1);
    render();
    onChange(items.length);
  }

  function makePrimary(index) {
    items.unshift(items.splice(index, 1)[0]);
    render();
  }

  function clear() {
    for (const item of items) URL.revokeObjectURL(item.url);
    items = [];
    render();
    onChange(0);
  }

  function render() {
    list.replaceChildren();
    clearButton.classList.toggle("is-hidden", !items.length);
    for (const [index, item] of items.entries()) {
      const card = document.createElement("article");
      card.className = "reference-image-item";

      const image = document.createElement("img");
      image.src = item.url;
      image.alt = index === 0 ? "主参考图" : `参考图 ${index + 1}`;

      const meta = document.createElement("div");
      meta.className = "reference-image-meta";
      const role = document.createElement("b");
      role.textContent = index === 0 ? "主参考" : `参考 ${index + 1}`;
      const name = document.createElement("span");
      name.textContent = item.file.name;
      name.title = item.file.name;
      meta.append(role, name);

      const actions = document.createElement("div");
      actions.className = "reference-image-actions";
      if (index > 0) {
        const primary = document.createElement("button");
        primary.type = "button";
        primary.textContent = "设为主图";
        primary.addEventListener("click", () => makePrimary(index));
        actions.append(primary);
      }
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "移除";
      removeButton.addEventListener("click", () => remove(index));
      actions.append(removeButton);

      card.append(image, meta, actions);
      list.append(card);
    }
  }

  return {
    get files() {
      return items.map(({ file }) => file);
    },
    setDisabled(value) {
      disabled = Boolean(value);
      input.disabled = disabled;
      dropzone.classList.toggle("is-disabled", disabled);
      clearButton.disabled = disabled;
      for (const button of list.querySelectorAll("button")) button.disabled = disabled;
    },
    destroy() {
      for (const item of items) URL.revokeObjectURL(item.url);
      items = [];
    }
  };
}
