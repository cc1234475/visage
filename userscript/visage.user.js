// ==UserScript==
// @name         visage
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Match faces to performers
// @author       cc12344567
// @match        http://localhost:9999/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @require      https://code.jquery.com/jquery-2.0.3.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://raw.githubusercontent.com/7dJx1qP/stash-userscripts/master/src\StashUserscriptLibrary.js
// ==/UserScript==

var VISAGE_API_URL = "https://stashface.eu.ngrok.io";
// var VISAGE_API_URL = "http://localhost:8000";
var REPORT_CORRECT_MATCHES = false;

(function () {
  "use strict";

  const {
    stash,
    Stash,
    waitForElementId,
    waitForElementClass,
    waitForElementByXpath,
    getElementByXpath,
    insertAfter,
    createElementFromHTML,
  } = unsafeWindow.stash;

  function waitForElm(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver((mutations) => {
        if (document.querySelector(selector)) {
          resolve(document.querySelector(selector));
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  var scanning = `<div role="dialog" aria-modal="true" class="fade ModalComponent modal show" tabindex="-1" style="display: block">
  <div class="modal-dialog scrape-query-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header"><span>Scanning...</span></div>
      <div class="modal-body">
        <div class="row justify-content-center">
        <h3>Scanning image for face</h3>
        </div>
      </div>
      <div class="ModalFooter modal-footer">
        <div>
          <button id="face_cancel" type="button" class="ml-2 btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</div>`;

  var top = `<div role="dialog" aria-modal="true" class="fade ModalComponent modal show" tabindex="-1" style="display: block">
<div class="modal-dialog scrape-query-dialog modal-xl">
  <div class="modal-content">
    <div class="modal-header"><span>Possible matches</span></div>
    <div class="modal-body">
      <div class="row justify-content-center">`;

  var match = (id, name, image, distance) => `
  <div draggable="false" class="performer-card grid-card card" id="face-${id}" style="cursor: pointer;">
    <div class="thumbnail-section">
        <img class="performer-card-image" alt="${name}" src="${image}"/>
    </div>
    <div class="card-section">
        <h5 class="card-section-title flex-aligned">
          <div style="-webkit-line-clamp: 2">
          ${name}
          <span class="tag-item badge badge-pill"><div>${distance}</div></span>
          </div>
        </h5>
    </div>
  </div>`;

  var bottom = `</div>
  </div>
<div class="ModalFooter modal-footer">
  <div>
    <button id="face_cancel" type="button" class="ml-2 btn btn-secondary">Cancel</button>
    <button id="face_toggle" type="button" class="ml-2 btn btn-secondary">Toggle Visibility</button>
  </div>
</div>
</div>
</div>
</div>`;

  async function add_performer(id_, name) {
    // find a performer with the same stash id in the user instance of stash
    var performers = await get_performers(id_);
    performers = performers.data.findPerformers.performers;
    // if the users doesn't have a performer with the same stash id, get the data from stash box and create a new performer
    if (performers.length === 0) {
      var performer = await get_performer_data_based_on_name(name);
      performer = performer.data.scrapeSinglePerformer.filter((p) => p.remote_site_id === id_)[0];
      if (performer === undefined) {
        alert("Could not retrieve performer data from stash box");
        return;
      }

      performer.image = performer.images[0];
      var endpoint = await get_stashbox_endpoint();
      endpoint = endpoint.data.configuration.general.stashBoxes[0].endpoint;

      // delete some fields that are not needed and will not be accepted by local stash instance
      delete performer.images;
      delete performer.remote_site_id;

      performer.stash_ids = [{ endpoint: endpoint, stash_id: id_ }];

      id_ = await create_performer(performer);
      id_ = id_.data.performerCreate.id;
    } else {
      id_ = performers[0].id;
    }

    // get the current list of performers, so we can add the new performer to the list
    var scene_id = document.URL.match(/scenes\/(\d+)/);
    scene_id = scene_id[1];
    var scene_performers = await get_performers_for_scene(scene_id);
    scene_performers = scene_performers.data.findScene.performers;
    var perform_ids = scene_performers.map((p) => p.id);
    if (perform_ids.includes(id_)){
      alert("Performer already assigned to scene");
      return;
    }

    perform_ids.push(id_);

    await update_scene(scene_id, perform_ids);
    location.reload();
  }

  async function get_performers(performer_id) {
    const reqData = {
      query: `{
        findPerformers( performer_filter: {stash_id: {value: "${performer_id}", modifier: EQUALS}}){
          performers {
            name
            id
          }
        }
      }`,
    };
    return stash.callGQL(reqData);
  }

  async function get_performers_for_scene(scene_id) {
    const reqData = {
      query: `{
        findScene(id: "${scene_id}") {
          performers {
            id
          }
        }
      }`,
    };
    return stash.callGQL(reqData);
  }

  async function update_scene(scene_id, performer_ids) {
    const reqData = {
      variables: { input: { id: scene_id, performer_ids: performer_ids } },
      query: `mutation sceneUpdate($input: SceneUpdateInput!){
        sceneUpdate(input: $input) {
          id
        }
      }`,
    };
    return stash.callGQL(reqData);
  }

  async function get_stashbox_endpoint() {
    const reqData = {
      query: `{
        configuration {
          general {
            stashBoxes {
              endpoint
            }
          }
        }
      }`,
    };
    return stash.callGQL(reqData);
  }

  async function get_performer_data_based_on_name(performer_name) {
    const reqData = {
      variables: {
        source: {
          stash_box_index: 0,
        },
        input: {
          query: performer_name,
        },
      },
      query: `query ScrapeSinglePerformer($source: ScraperSourceInput!, $input: ScrapeSinglePerformerInput!) {
          scrapeSinglePerformer(source: $source, input: $input) {
              name
              gender
              url
              twitter
              instagram
              birthdate
              ethnicity
              country
              eye_color
              height
              measurements
              fake_tits
              career_length
              tattoos
              piercings
              aliases
              images
              details
              death_date
              hair_color
              weight
              remote_site_id
          }
        }`,
    };
    return stash.callGQL(reqData);
  }

  async function create_performer(performer) {
    const reqData = {
      variables: { input: performer },
      query: `mutation performerCreate($input: PerformerCreateInput!) {
          performerCreate(input: $input){
              id
          }
        }`,
    };
    return stash.callGQL(reqData);
  }

  function show_matches(visage_id, matches) {
    var html = top;
    for (var i = 0; i < matches.length; i++) {
      let per = matches[i];
      html += match(i, per.name, per.image, per.distance);
    }
    html += bottom;
    $("body").append(html);

    $("#face_cancel").click(function () {
      close_modal();
    });

    $("#face_toggle").click(function () {
      var obj = $(".ModalComponent");
      if (obj.css('opacity') == '0.1'){
        $(".ModalComponent").css('opacity', '1.0');
      }else{
        $(".ModalComponent").css('opacity', '0.1');
      }
    });

    $("#face-0").click(function () {
      add_performer(matches[0].id, matches[0].name);
      close_modal();
      acknowledge_match(visage_id, matches[0].id);
    });

    $("#face-1").click(function () {
      add_performer(matches[1].id, matches[1].name);
      close_modal();
      acknowledge_match(visage_id, matches[1].id);
    });

    $("#face-2").click(function () {
      add_performer(matches[2].id, matches[2].name);
      close_modal();
      acknowledge_match(visage_id, matches[2].id);
    });
  }

  function acknowledge_match(visage_id, performer_id) {
    if (REPORT_CORRECT_MATCHES === false) return;

    const formData = new FormData();
    formData.append("id", visage_id);
    formData.append("performer_id", performer_id);

    var requestDetails = {
      method: "POST",
      url: VISAGE_API_URL + "/confirm",
      data: formData
    };
    GM_xmlhttpRequest(requestDetails);
  }

  function recognize() {
    html2canvas(document.querySelector("#VideoJsPlayer")).then((canvas) => {
      let image = canvas.toDataURL("image/jpg");
      image = image.replace(/^data:image\/(png|jpg);base64,/, "");
      $("body").append(scanning);

      const formData = new FormData();
      formData.append("image", image);

      var requestDetails = {
        method: "POST",
        url: VISAGE_API_URL + "/recognise?results=3",
        data: formData,
        onload: function (response) {
          var data = JSON.parse(response.responseText);
          // Remove the scanning modal
          close_modal();
          if (data.performers.length === 0) {
            alert("No matches found");
            return;
          }
          show_matches(data.id, data.performers);
        },
        onerror: function (response) {
          close_modal();
          alert("Error: " + response.responseText);
        }
      };
      GM_xmlhttpRequest(requestDetails);
    });
  }

  function close_modal(){
    $(".ModalComponent").remove();
  }

  stash.addEventListener("page:scene", function () {
    waitForElm(".ml-auto .btn-group").then(() => {
      const grp = document.querySelector(".ml-auto .btn-group");
      const btn = document.createElement("button");
      btn.setAttribute("id", "facescan");
      btn.setAttribute("title", "Scan for performer");
      btn.classList.add("btn", "btn-secondary", "minimal");
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="mdi-magnify-scan" width="20" height="20" viewBox="0 0 24 24"><path d="M17 22V20H20V17H22V20.5C22 20.89 21.84 21.24 21.54 21.54C21.24 21.84 20.89 22 20.5 22H17M7 22H3.5C3.11 22 2.76 21.84 2.46 21.54C2.16 21.24 2 20.89 2 20.5V17H4V20H7V22M17 2H20.5C20.89 2 21.24 2.16 21.54 2.46C21.84 2.76 22 3.11 22 3.5V7H20V4H17V2M7 2V4H4V7H2V3.5C2 3.11 2.16 2.76 2.46 2.46C2.76 2.16 3.11 2 3.5 2H7M10.5 6C13 6 15 8 15 10.5C15 11.38 14.75 12.2 14.31 12.9L17.57 16.16L16.16 17.57L12.9 14.31C12.2 14.75 11.38 15 10.5 15C8 15 6 13 6 10.5C6 8 8 6 10.5 6M10.5 8C9.12 8 8 9.12 8 10.5C8 11.88 9.12 13 10.5 13C11.88 13 13 11.88 13 10.5C13 9.12 11.88 8 10.5 8Z" style="fill: rgb(255, 255, 255);" /></svg>';
      btn.onclick = recognize;
      grp.appendChild(btn);
    });
  });
})();
