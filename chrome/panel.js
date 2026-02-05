
(() => {
  var maxTask = document.getElementById("maxTask");
  var maxTaskValue = document.getElementById("maxTaskValue");
  if (!maxTask || !maxTaskValue) {
    return;
  }

  var updateValue = function () {
    maxTaskValue.innerText = maxTask.value;
  };

  updateValue();
  maxTask.addEventListener("input", updateValue);
})();
