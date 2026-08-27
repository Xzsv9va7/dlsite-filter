"use strict";

const SELECTORS = {
  workItem: [
    "li.swiper-slide",
    ".recommend_work_item",
    "li.search_result_img_box_inner",
    "#search_result_img_box > li",
    "table.work_1col_table.n_worklist > tbody > tr",
    ".n_worklist > tbody > tr",
    "li.n_worklist_item",
    "li.ranking_top_worklist_item",
    "[data-list_item_product_id]",
    "li.work_item",
    ".work_right_list li",
    ".work_history_item",
    ".work_recommend_item",
    ".work_author_item",
    ".work_voice_item",
    ".type_responsive_work_item"
  ].join(", "),

  workTitle: [
    ".work_name",
    ".work_name a",
    "dt.work_name a",
    ".search_work_name a",
    "a.work_name",
    ".title a",
    ".work_title a",
    "a[class*='title']",
    ".work_1col_title a",
    "a[href*='/product_id/']"
  ].join(", "),

  circleName: [
    ".maker_name",
    ".maker_name a",
    "dd.maker_name a",
    "a[href*='/circle/profile/']",
    "a[href*='/maker_id/']",
    ".author a",
    ".work_author a"
  ].join(", "),

  genre: [
    ".search_tag a",
    "dd.search_tag a",
    ".work_genre a",
    "dd.work_genre a",
    "a.search_tag",
  ].join(", "),
};