// ==UserScript==
// @name         visage
// @namespace    https://github.com/cc1234475
// @version      0.1
// @description  Match faces to performers
// @author       cc12344567
// @match        http://localhost:9999/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @require      https://code.jquery.com/jquery-2.0.3.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://raw.githubusercontent.com/7dJx1qP/stash-userscripts/master/src\StashUserscriptLibrary.js
// ==/UserScript==

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

  var top = `<div role="dialog" aria-modal="true" class="fade ModalComponent modal show" tabindex="-1" style="display: block">
<div class="modal-dialog scrape-query-dialog modal-xl">
  <div class="modal-content">
    <div class="modal-header"><span>Possible matches</span></div>
    <div class="modal-body">
    <div class="row justify-content-center">`;

  var match = (id, name, image, distance) => `
  <div draggable="false" class="performer-card grid-card card" id="face-${id}">
    <div class="thumbnail-section">
        <img class="performer-card-image" alt="${name}" src="${image}"/>
    </div>
    <div class="card-section">
        <h5 class="card-section-title flex-aligned">
          <div class="TruncatedText" style="-webkit-line-clamp: 2">
          ${distance}) ${name}
          </div>
        </h5>
    </div>
  </div>`;

  var bottom = `</div></div>
<div class="ModalFooter modal-footer">
  <div>
    <button id="face_cancel" type="button" class="ml-2 btn btn-secondary">Cancel</button>
  </div>
</div></div></div></div>`;

  async function add_performer(id_, name) {
    // find a performer with the same stash id in the user instance of stash
    var performers = await get_performers(id_);
    performers = performers.data.findPerformers.performers;
    // if the users doesn't have a performer with the same stash id, get the data from stashDB and create a new performer
    if (performers.length === 0) {
      var performer = await get_performer_data_based_on_name(name);
      performer = performer.data.scrapeSinglePerformer[0];
      performer.image = performer.images[0];
      var endpoint = await get_stashbox_endpoint();
      endpoint = endpoint.data.configuration.general.stashBoxes[0].endpoint

      delete performer.images;
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
    if (perform_ids.includes(id_)) return;

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

  function show_matches(matches) {
    var html = top;
    for (var i = 0; i < matches.length; i++) {
      let per = matches[i];
      html += match(i, per.name, per.image, per.distance);
    }
    html += bottom;
    $("body").append(html);

    $("#face_cancel").click(function () {
      $(".ModalComponent").remove();
    });

    $("#face-0").click(function () {
      add_performer(matches[0].id, matches[0].name);
      $(".ModalComponent").remove();
    });

    $("#face-1").click(function () {
      add_performer(matches[1].id, matches[1].name);
      $(".ModalComponent").remove();
    });

    $("#face-2").click(function () {
      add_performer(matches[2].id, matches[2].name);
      $(".ModalComponent").remove();
    });
  }

  function recognize() {
    html2canvas(document.querySelector("#VideoJsPlayer")).then((canvas) => {
      let image = canvas.toDataURL("image/jpg");
      image = image.replace(/^data:image\/(png|jpg);base64,/, "");

      const formData = new FormData();
      formData.append("image", image);

      var requestDetails = {
        method: "POST",
        url: "https://stashface.eu.ngrok.io/recognise?results=3",
        data: formData,
        onload: function (response) {
          var data = JSON.parse(response.responseText);
          show_matches(data.performers);
        },
      };
      GM_xmlhttpRequest(requestDetails);
    });
  }

  stash.addEventListener("page:scene", function () {
    waitForElm(".ml-auto .btn-group").then(() => {
      const grp = document.querySelector(".ml-auto .btn-group");
      const btn = document.createElement("button");
      btn.setAttribute("id", "facescan");
      btn.classList.add("btn", "btn-secondary", "ml-3", "btn-sm");
      btn.innerHTML = "Scan face";
      btn.onclick = () => {
        recognize();
      };
      grp.appendChild(btn);
    });
  });
})();
