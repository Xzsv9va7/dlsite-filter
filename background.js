"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    api.runtime.openOptionsPage();
  }
});

api.action.onClicked.addListener(() => {
  api.runtime.openOptionsPage();
});
