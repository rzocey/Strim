var app = window.app || {};
Object.assign(app, {
  exploreType: "movie",
  lastExploreType: "movie",
  explorePage: 1,
  exploreLoading: false,
  currentShow: null,
  watchState: {
    id: null,
    type: null,
    season: 1,
    episode: 1,
    epCount: 0,
    isAnime: false,
    aniId: null,
    malId: null,
    animeFormat: null,
  },
  blockWatchOnBack: false,
  exploreFilterExpanded: false,
  exploreEntitySearchOpen: false,
  exploreEntitySearchQuery: "",
  exploreEntitySearchTimer: null,
  personSearchOpen: false,
  personSearchQuery: "",
  personSearchTimer: null,
  sourceSearchOpen: false,
  sourceSearchQuery: "",
  sourceSearchTimer: null,
  scrollDownOnReturnToShowinfo: false,
  movieMediaState: { active: false, items: [], page: 0, id: null },
  showSeasons: {},
  currentEpisodes: [],
  currentOmdbEpisodes: {},
  explorePrefs: { movie: {}, tv: {}, person: {}, company: {} },
  exploreRandomActive: false,
  exploreRandomPool: [],
  exploreRandomAniPool: [],
  exploreRandomPersonList: null,
  closeTrailer(e = null, fromPopState = false) {
    this.toggleAppModal("trailer", false, e, fromPopState);
  },
  selectExploreCategory(
    type,
    pushState = true,
    restoreScroll = false,
    replaceState = false,
  ) {
    document.body.classList.remove("explore-hub-open");
    document.documentElement.classList.remove("explore-hub-open");
    const viewMap = {
      movie: "movies",
      tv: "shows",
      company: "companies",
      person: "people",
    };
    const titleMap = {
      movie: "Movies",
      tv: "Shows",
      company: "Companies",
      person: "People",
    };
    const viewId = viewMap[type] || "movies";
    const title = titleMap[type] || "Movies";
    this.setActiveView("explore", viewId);
    const isSameType = this.exploreType === type;
    if (!isSameType) this.resetExploreRandom();
    this.exploreType = type;
    this.$g("explore-hub").style.display = "none";
    const ehHeader = this.$g("explore-hub-header");
    if (ehHeader) ehHeader.style.display = "none";
    this.$g("explore-catalog").style.display = "block";
    const tEl = this.$g("explore-title");
    if (tEl) tEl.innerText = title;
    ["tv", "movie", "company", "person"].forEach((k) => {
      const sw = this.$g("explore-switch-" + k);
      if (sw) {
        sw.style.display = "";
        sw.classList.toggle("active", k === type);
      }
    });
    this.syncHistoryUrl(
      { view: viewId },
      title,
      `?view=${viewId}`,
      pushState,
      replaceState,
    );
    this.currentView = viewId;
    this.updateBackBtn(this.currentView);
    const grid = this.$g("explore-grid");
    const hasCards = Boolean(grid && grid.children && grid.children.length > 0);
    if (this.returnFromShowinfoToExplore) {
      this.returnFromShowinfoToExplore = false;
    } else {
      this.exploreFilterExpanded = false;
      if (!restoreScroll || !isSameType || !hasCards) {
        this.exploreEntitySearchOpen = false;
        this.exploreEntitySearchQuery = "";
        const esInp = this.$g("explore-entity-search-input");
        if (esInp) esInp.value = "";
      }
    }
    this.updateExploreFilterToggleUI();
    if (restoreScroll && isSameType && hasCards) {
      this.exploreLoading = false;
      const targetY =
        (this.exploreScrollPos && this.exploreScrollPos[type]) || 0;
      this.restoreScroll(targetY);
      return;
    }
    window.scrollTo(0, 0);
    this.resetExplore(true);
  },
  showExploreHub(pushState = false) {
    this.resetExploreRandom();
    document.body.classList.add("explore-hub-open");
    document.documentElement.classList.add("explore-hub-open");
    this.$g("explore-hub").style.display = "grid";
    const ehHeader = this.$g("explore-hub-header");
    if (ehHeader) ehHeader.style.display = "block";
    this.$g("explore-catalog").style.display = "none";
    this.syncHistoryUrl(
      { view: "explore" },
      "Explore",
      "?view=explore",
      pushState,
    );
    this.currentView = "explore";
    this.updateBackBtn("explore");
    this.populateExploreHubPosters();
  },
  startExploreCollageAutoSlide() {
    clearInterval(this.exploreCollageTimer);
  },
  advanceExploreCollageSets() {
    clearInterval(this.exploreCollageTimer);
    if (!this.exploreSets) return;
    if (!this.exploreCollageIdxMap) {
      const savedIdx = this.$storeGet("str_c_explore_collage_idx", null);
      this.exploreCollageIdxMap =
        savedIdx && savedIdx.idxMap
          ? savedIdx.idxMap
          : { movie: 0, tv: 0, company: 0, person: 0 };
    }
    ["movie", "tv", "company", "person"].forEach((k) => {
      const catSets = this.exploreSets[k];
      if (catSets && catSets.length > 1) {
        this.exploreCollageIdxMap[k] =
          ((this.exploreCollageIdxMap[k] || 0) + 1) % catSets.length;
      }
    });
    this.$storeSet("str_c_explore_collage_idx", {
      step: 0,
      idxMap: this.exploreCollageIdxMap,
    });
    [
      "explore-movies-collage",
      "explore-series-collage",
      "explore-companies-collage",
      "explore-people-collage",
    ].forEach((id) => {
      const el = this.$g(id);
      if (el) el.innerHTML = "";
    });
  },
  async populateExploreHubPosters() {
    const mCol = this.$g("explore-movies-collage");
    const sCol = this.$g("explore-series-collage");
    const cCol = this.$g("explore-companies-collage");
    const pCol = this.$g("explore-people-collage");
    if (!mCol || !sCol || !cCol || !pCol) return;
    if (
      mCol.children.length > 0 &&
      sCol.children.length > 0 &&
      cCol.children.length > 0 &&
      pCol.children.length > 0
    ) {
      this.startExploreCollageAutoSlide();
      return;
    }
    const makeGrid = (urls, isComp = false) =>
      '<div class="explore-collage-grid">' +
      urls
        .map(
          (u) =>
            '<div class="explore-collage-item"><img src="' +
            u +
            '" class="explore-collage-img" alt=""' +
            (isComp
              ? ' crossorigin="anonymous" onload="app.applyCompanyLogoBg(this)"'
              : "") +
            "></div>",
        )
        .join("") +
      "</div>";
    const revealExploreSet = () => {
      const cols = [mCol, sCol, cCol, pCol];
      const imgs = cols.flatMap((col) =>
        Array.from(col.querySelectorAll(".explore-collage-img")),
      );
      if (imgs.length === 0) return;
      const waits = imgs.map(
        (img) =>
          new Promise((res) => {
            if (img.complete) return res();
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
          }),
      );
      Promise.race([
        Promise.all(waits),
        new Promise((res) => setTimeout(res, 4000)),
      ]).then(() => {
        requestAnimationFrame(() =>
          imgs.forEach((img) => img.classList.add("loaded")),
        );
      });
    };
    if (!this.exploreSets)
      this.exploreSets =
        this.$storeGet("str_c_exploresets_v7", null) ||
        this.$sessGet("str_c_exploresets_v7", null);
    if (!this.exploreCollageIdxMap) {
      const savedIdx = this.$storeGet("str_c_explore_collage_idx", null);
      this.exploreCollageIdxMap =
        savedIdx && savedIdx.idxMap
          ? savedIdx.idxMap
          : { movie: 0, tv: 0, company: 0, person: 0 };
      if (savedIdx && typeof savedIdx.step === "number")
        this.exploreCollageStep = savedIdx.step;
    }
    if (
      this.exploreSets &&
      this.exploreSets.movie &&
      this.exploreSets.movie.length > 0 &&
      this.exploreSets.tv &&
      this.exploreSets.tv.length > 0 &&
      this.exploreSets.company &&
      this.exploreSets.company.length > 0 &&
      this.exploreSets.person &&
      this.exploreSets.person.length > 0
    ) {
      const getIdx = (k) =>
        (this.exploreCollageIdxMap[k] || 0) % this.exploreSets[k].length;
      if (mCol.children.length === 0)
        mCol.innerHTML = makeGrid(this.exploreSets.movie[getIdx("movie")]);
      if (sCol.children.length === 0)
        sCol.innerHTML = makeGrid(this.exploreSets.tv[getIdx("tv")]);
      if (cCol.children.length === 0)
        cCol.innerHTML = makeGrid(
          this.exploreSets.company[getIdx("company")],
          true,
        );
      if (pCol.children.length === 0)
        pCol.innerHTML = makeGrid(this.exploreSets.person[getIdx("person")]);
      revealExploreSet();
      this.startExploreCollageAutoSlide();
      return;
    }
    try {
      const [m1, s1, p1, wp] = await Promise.all([
        this.api("/discover/movie", { sort_by: "revenue.desc", page: 1 }).catch(
          () => ({ results: [] }),
        ),
        this.api("/discover/tv", { sort_by: "vote_count.desc", page: 1 }).catch(
          () => ({ results: [] }),
        ),
        this.api("/person/popular", { page: 1 }).catch(() => ({ results: [] })),
        Promise.all(
          [
            "213",
            "1024",
            "2739",
            "2552",
            "453",
            "6703",
            "3186",
            "4330",
            "3353",
            "1112",
            "318",
            "67",
          ].map((nid) => this.api("/network/" + nid, {}).catch(() => null)),
        ),
      ]);
      const mItems = (m1.results || [])
        .filter((i) => i.poster_path && !this.isBlocked(i, "movie"))
        .slice(0, 12);
      const sItems = (s1.results || [])
        .filter((i) => i.poster_path && !this.isBlocked(i, "tv"))
        .slice(0, 12);
      const usedPersonIds = new Set();
      const popPeople = p1.results || [];
      const actors = [];
      for (let i = 0; i < popPeople.length && actors.length < 12; i++) {
        const p = popPeople[i];
        if (
          p &&
          p.profile_path &&
          !p.adult &&
          p.known_for_department === "Acting" &&
          !usedPersonIds.has(p.id)
        ) {
          usedPersonIds.add(p.id);
          actors.push(IMG_BASE + "w185" + p.profile_path);
        }
      }
      const personUrls = actors.slice(0, 12);
      const seenLogos = new Set();
      const companyUrls = [];
      (wp || []).forEach((p) => {
        const path = p && p.logo_path;
        if (path && companyUrls.length < 12 && !seenLogos.has(path)) {
          seenLogos.add(path);
          companyUrls.push(IMG_BASE + "w185" + path);
        }
      });
      const chunkList = (urls) => {
        const unique = [...new Set((urls || []).filter(Boolean))];
        let sets = [];
        for (let i = 0; i < unique.length; i += 4) {
          const chunk = unique.slice(i, i + 4);
          if (chunk.length >= 4) sets.push(chunk);
        }
        return sets;
      };
      this.exploreSets = {
        movie: chunkList(
          mItems.map((it) => IMG_BASE + "w154" + it.poster_path),
        ),
        tv: chunkList(sItems.map((it) => IMG_BASE + "w154" + it.poster_path)),
        company: chunkList(companyUrls),
        person: chunkList(personUrls),
      };
      this.$storeSet("str_c_exploresets_v7", this.exploreSets);
      if (this.exploreSets.movie.length > 0)
        mCol.innerHTML = makeGrid(this.exploreSets.movie[0]);
      if (this.exploreSets.tv.length > 0)
        sCol.innerHTML = makeGrid(this.exploreSets.tv[0]);
      if (this.exploreSets.company.length > 0)
        cCol.innerHTML = makeGrid(this.exploreSets.company[0], true);
      if (this.exploreSets.person.length > 0)
        pCol.innerHTML = makeGrid(this.exploreSets.person[0]);
      revealExploreSet();
      this.startExploreCollageAutoSlide();
    } catch (e) {}
  },
  homeLoaded: false,
  dominoTimer: null,
  dominoSteps: [
    {
      id: "row-trend-movies",
      type: "movie",
      ep: "/trending/movie/day",
      params: {},
      delayAfter: 60 * 1000,
    },
    {
      id: "row-trend-series",
      type: "tv",
      ep: "/trending/tv/day",
      params: {},
      delayAfter: 60 * 1000,
    },
    {
      id: "row-top-movies",
      type: "movie",
      ep: "/discover/movie",
      params: {
        sort_by: "revenue.desc",
      },
      delayAfter: 60 * 1000,
    },
    {
      id: "row-top-series",
      type: "tv",
      ep: "/discover/tv",
      params: {
        sort_by: "vote_count.desc",
      },
      delayAfter: 3 * 60 * 1000,
    },
  ],
  yearSortOrder: "desc",
  exploreScrollPos: {
    movie: 0,
    tv: 0,
    person: 0,
    company: 0,
  },
  heroItems: [],
  heroIdx: 0,
  heroTimer: null,
  heroSourceItems: null,
  heroDominoTimer: null,
  heroDominoSteps: [
    {
      slot: 0,
      label: "M1",
      type: "movie",
      delayAfter: 30 * 1000,
    },
    {
      slot: 1,
      label: "S1",
      type: "tv",
      delayAfter: 30 * 1000,
    },
    {
      slot: 2,
      label: "M2",
      type: "movie",
      delayAfter: 30 * 1000,
    },
    {
      slot: 3,
      label: "S2",
      type: "tv",
      delayAfter: 30 * 1000,
    },
    {
      slot: 4,
      label: "M3",
      type: "movie",
      delayAfter: 30 * 1000,
    },
    {
      slot: 5,
      label: "S3",
      type: "tv",
      delayAfter: 2 * 60 * 1000,
    },
  ],
  siHeroTimer: null,
  filterKeys: [
    "genre",
    "genre2",
    "aniTag",
    "season",
    "year",
    "country",
    "compNet",
    "person",
    "aniStudio",
    "aniStaff",
    "exp-role",
  ],
  updateBackBtn(v) {
    const b = this.$g("global-back-btn");
    if (!b) return;
    b.style.display = "";
    const isHome = v === "home";
    b.classList.toggle("nav-back-hidden", isHome);
    const nav = document.querySelector(".glass-nav");
    if (nav) nav.classList.toggle("has-back-btn", !isHome);
  },
  updatePlayerDropdown: function (selectedType, selectedIndex) {
    const typeSel = this.$g("w-player-type-sel");
    const numSel = this.$g("w-server-num-sel");
    if (!numSel) return;
    const isAni = Boolean(this.watchState && this.watchState.isAnime);
    let sType = selectedType;
    if (isAni) {
      const currentVariant =
        selectedType || this.$storeGet("preferredAnimeVariant", "sub") || "sub";
      sType = currentVariant === "dub" ? "dub" : "sub";
      if (typeSel) {
        typeSel.style.display = "";
        typeSel.innerHTML =
          '<option value="sub">Sub</option><option value="dub">Dub</option>';
        typeSel.value = sType;
      }
    } else {
      if (typeSel) typeSel.style.display = "none";
      sType = "embed";
    }
    const serverGroup = isAni
      ? animeServers[sType] || animeServers.sub
      : embedServers;
    const disabledGroup =
      (this.disabledServers && this.disabledServers[sType]) || [];
    let opts = "";
    Object.keys(serverGroup).forEach((i) => {
      if (disabledGroup.includes(String(i))) return;
      const pName =
        serverGroup[i] && serverGroup[i].name
          ? serverGroup[i].name
          : `Player ${i}`;
      opts += `<option value="${i}">${pName}</option>`;
    });
    const curWatchType = (this.watchState && this.watchState.type) || "movie";
    (this.customServers || [])
      .filter(
        (s) =>
          s.category === sType &&
          (!s.mediaType ||
            s.mediaType === "all" ||
            s.mediaType === curWatchType),
      )
      .forEach((cs) => {
        opts += `<option value="${cs.id}">${cs.name}</option>`;
      });
    numSel.innerHTML = opts || '<option value="1">No players enabled</option>';
    const prefKey = isAni
      ? sType === "dub"
        ? "preferredAnimeDubPlayer"
        : "preferredAnimePlayer"
      : "preferredPlayer";
    numSel.value = selectedIndex || this.$storeGet(prefKey, "1") || "1";
  },
  playerGoBack: function () {
    if (document.fullscreenElement) return;
    this.resetPlayerIframe();
    const showId =
      this.watchState.id || (this.currentShow && this.currentShow.id);
    const showType =
      this.watchState.type ||
      (this.currentShow &&
        (this.currentShow.media_type || this.currentShow.type)) ||
      "tv";
    this.watchFromEpHistory = false;
    this.blockWatchOnBack = true;
    const isTv = Boolean(
      showType === "tv" ||
      (this.currentShow &&
        (this.currentShow.media_type === "tv" ||
          this.currentShow.type === "tv")),
    );
    this.scrollDownOnReturnToShowinfo = isTv;
    this.scrollOverlayOnReturnToShowinfo = isTv;
    if (isTv) this.showSiScrollOverlay(true);
    if (showId) {
      this.openShowinfo(showId, showType, false, true, isTv, isTv);
    } else {
      this.showSiScrollOverlay(false);
      this.navigate("home", false, true);
    }
  },
  _clearFilterInputDrop: function (key, scope) {
    const pfx = scope === "block" ? "bc-" : "filter-";
    const fk = this.getFieldKey(key);
    const inp = this.$g(`${pfx}${fk}-input`);
    if (inp) inp.value = "";
    const drop = this.$g(`${pfx}${fk}-drop`);
    if (drop) {
      drop.style.display = "none";
      drop.innerHTML = "";
    }
  },
  toggleWatched: function (item) {
    if (!item || !item.id) return false;
    const eqIds = this.getEquivalentIds(item.id, item);
    const idStr = String(item.id);
    if (!this.watchedList) this.watchedList = {};
    const existingKey = Array.from(eqIds).find((eid) =>
      Boolean(this.watchedList[eid]),
    );
    let isW = false;
    if (existingKey) {
      eqIds.forEach((eid) => delete this.watchedList[eid]);
      isW = false;
    } else {
      eqIds.forEach((eid) => delete this.watchedList[eid]);
      const summary = this.toCardSummary(item);
      summary.addedAt = Date.now();
      this.watchedList[idStr] = summary;
      if (item.poster_path && typeof this.applyCardPosterBg === "function")
        this.applyCardPosterBg(null, item.poster_path);
      isW = true;
    }
    this.$storeSet("sh_watched_list", this.watchedList);
    const selector = Array.from(eqIds)
      .map((id) => `.poster-card[data-show-id="${id}"]`)
      .join(", ");
    const cards = document.querySelectorAll(selector);
    cards.forEach((card) => {
      const imgContainer = card.querySelector(".poster-img-container");
      if (!imgContainer) return;
      const existingBadge = imgContainer.querySelector(".watched-badge");
      if (isW) {
        if (!existingBadge) {
          const badge = document.createElement("div");
          badge.className = "watched-badge";
          badge.title = "Watched";
          badge.innerHTML = EYE_SVG(13, 13);
          imgContainer.appendChild(badge);
        }
      } else {
        if (existingBadge) existingBadge.remove();
      }
    });
    if (this.currentView === "markedaswatched") this.loadMarkedAsWatch();
    return isW;
  },
  setHero: function (idx) {
    clearTimeout(this.heroTimer);
    clearInterval(this.heroTimer);
    this.heroTimer = null;
    if (!this.heroItems || this.heroItems.length === 0) return;
    const hero = this.heroItems[idx];
    if (!hero) return;
    const hName = hero.title || hero.name || "";
    const logoSrc = hero.logo_path
      ? this.getImg(hero.logo_path, "logo")
      : hero.fanart_logo;
    if (!logoSrc) {
      this.heroItems.splice(idx, 1);
      if (this.heroItems.length > 0) this.setHero(idx % this.heroItems.length);
      return;
    }
    const reqId = ++this.heroReqId;
    const hc = document.querySelector(".hero-content");
    const hBg = this.$g("hero-bg");
    const hBlur = this.$g("hero-blur-bg");
    const heroTitle = this.$g("hero-title");
    const heroBanner = this.$g("home-hero");
    const hasCurrentBg = Boolean(
      hBg && hBg.style.backgroundImage && hBg.style.backgroundImage !== "none",
    );
    const applyHeroContent = () => {
      if (reqId !== this.heroReqId) return;
      this.heroIdx = idx;
      const ctry = this.getCountryCode(hero);
      const fullCtry =
        this.countryMap && this.countryMap[ctry] ? this.countryMap[ctry] : ctry;
      const heroYear = this.getItemYear(hero);
      const heroParts = [];
      if (hero.media_type) {
        if (hero.media_type === "movie") {
          heroParts.push(
            this.formatMovieType(this.resolveMovieType(hero), "card"),
          );
        } else {
          heroParts.push(this.getShowTypeText(hero, "card"));
        }
      }
      if (heroYear) heroParts.push(heroYear);
      if (fullCtry) heroParts.push(fullCtry);
      const hMeta = this.$g("hero-meta");
      if (hMeta) hMeta.innerHTML = heroParts.join(" &bull; ");
      const heroCastEl = this.$g("hero-cast");
      if (heroCastEl) {
        const cast = hero.credits?.cast || [];
        const starNames = [
          ...new Set(cast.map((c) => c.name).filter(Boolean)),
        ].slice(0, 3);
        heroCastEl.innerHTML =
          starNames.length > 0 ? starNames.join(" &bull; ") : "";
        heroCastEl.style.display = starNames.length > 0 ? "flex" : "none";
      }
      const hDesc = this.$g("hero-desc");
      if (hDesc) hDesc.innerText = (hero.overview || "").replace(/—/g, " ");
      if (heroBanner) {
        this.setupHeroSwipe(heroBanner);
        heroBanner.onclick = (e) => {
          if (this._heroJustSwiped) return;
          if (
            e &&
            e.target &&
            e.target.closest(
              "#hero-indicators, .hero-dot, #hero-bottom-bar, .hero-bottom-bar",
            )
          )
            return;
          app.openShowinfo(hero.id, hero.media_type);
        };
      }
      document.querySelectorAll(".hero-dot").forEach((d, i) => {
        if (i === idx) d.classList.add("active");
        else d.classList.remove("active");
      });
      if (heroTitle) {
        heroTitle.innerHTML = `<img src="${logoSrc}" class="title-logo hero-title-logo loaded" alt="${hName.replace(/"/g, "&quot;")}" onerror="app.handleHeroLogoError('${hero.id}')">`;
      }
      const revealHero = () => {
        if (reqId !== this.heroReqId) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (reqId === this.heroReqId && hc)
              hc.classList.remove("is-transitioning");
          });
        });
      };
      const logoImg = heroTitle ? heroTitle.querySelector("img") : null;
      if (logoImg && !logoImg.complete) {
        let revealed = false;
        const done = () => {
          if (!revealed) {
            revealed = true;
            revealHero();
          }
        };
        logoImg.addEventListener("load", done, { once: true });
        logoImg.addEventListener("error", done, { once: true });
        setTimeout(done, 1500);
      } else {
        revealHero();
      }
      const bgUrl = hero.backdrop_path
        ? this.getImg(hero.backdrop_path, "backdrop")
        : "";
      if (bgUrl) {
        let bgDone = false;
        const onBgLoaded = () => {
          if (bgDone || reqId !== this.heroReqId) return;
          bgDone = true;
          if (heroBanner) heroBanner.classList.remove("is-loading");
          if (hBg) {
            hBg.style.backgroundImage = `url('${bgUrl}')`;
            hBg.style.opacity = "1";
          }
          if (hBlur) {
            hBlur.style.backgroundImage = `url('${bgUrl}')`;
            hBlur.style.opacity = "1";
          }
          if (this.currentView === "home") this.startHeroTimer();
        };
        const bgImg = new Image();
        bgImg.onload = onBgLoaded;
        bgImg.onerror = () => {
          if (bgDone || reqId !== this.heroReqId) return;
          bgDone = true;
          if (heroBanner) heroBanner.classList.remove("is-loading");
          if (this.currentView === "home") this.startHeroTimer();
        };
        bgImg.src = bgUrl;
        if (bgImg.complete && bgImg.naturalWidth > 0) {
          onBgLoaded();
        }
        setTimeout(() => {
          if (bgDone || reqId !== this.heroReqId) return;
          bgDone = true;
          if (heroBanner) heroBanner.classList.remove("is-loading");
          if (this.currentView === "home") this.startHeroTimer();
        }, 45000);
      } else {
        if (heroBanner) heroBanner.classList.remove("is-loading");
        if (this.currentView === "home") this.startHeroTimer();
      }
    };
    if (hasCurrentBg) {
      if (hc) hc.classList.add("is-transitioning");
      if (hBg) hBg.style.opacity = "0";
      if (hBlur) hBlur.style.opacity = "0";
      if (heroBanner) heroBanner.classList.add("is-loading");
      setTimeout(applyHeroContent, 300);
    } else {
      if (hc) hc.classList.add("is-transitioning");
      if (heroBanner) heroBanner.classList.add("is-loading");
      applyHeroContent();
    }
  },
  setupHeroSwipe: function (heroBanner) {
    if (!heroBanner || heroBanner._swipeBound) return;
    heroBanner._swipeBound = true;
    let startX = 0,
      startY = 0,
      active = false,
      isTouch = false;
    const triggerSwipe = (dx) => {
      if (!this.heroItems || this.heroItems.length <= 1) return false;
      if (Math.abs(dx) < 40) return false;
      this._heroJustSwiped = true;
      setTimeout(() => {
        this._heroJustSwiped = false;
      }, 320);
      const nextIdx =
        dx < 0
          ? (this.heroIdx + 1) % this.heroItems.length
          : (this.heroIdx - 1 + this.heroItems.length) % this.heroItems.length;
      this.setHero(nextIdx);
      return true;
    };
    heroBanner.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        if (
          e.target &&
          e.target.closest(
            "#hero-indicators, .hero-dot, #hero-bottom-bar, .hero-bottom-bar",
          )
        )
          return;
        isTouch = true;
        active = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );
    heroBanner.addEventListener(
      "touchend",
      (e) => {
        if (!active || !isTouch) return;
        active = false;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy)) triggerSwipe(dx);
      },
      { passive: true },
    );
    heroBanner.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (
        e.target &&
        e.target.closest(
          "#hero-indicators, .hero-dot, #hero-bottom-bar, .hero-bottom-bar",
        )
      )
        return;
      isTouch = false;
      active = true;
      startX = e.clientX;
      startY = e.clientY;
    });
    window.addEventListener("mouseup", (e) => {
      if (!active || isTouch) return;
      active = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy)) triggerSwipe(dx);
    });
  },
  handleHeroLogoError: function (heroId) {
    if (!this.heroItems || this.heroItems.length === 0) return;
    const idx = this.heroItems.findIndex(
      (h) => String(h.id) === String(heroId),
    );
    if (idx > -1) {
      this.heroItems.splice(idx, 1);
      if (this.heroItems.length > 0)
        this.setHero(this.heroIdx % this.heroItems.length);
    }
  },
  startHeroTimer: function () {
    clearTimeout(this.heroTimer);
    clearInterval(this.heroTimer);
    this.heroTimer = setTimeout(() => {
      if (
        this.currentView === "home" &&
        this.heroItems &&
        this.heroItems.length > 0
      ) {
        this.heroIdx = (this.heroIdx + 1) % this.heroItems.length;
        this.setHero(this.heroIdx);
      }
    }, 6000);
  },
  resolveContinueWideMedia: function (item, type, idStr) {
    if (!this._cwBannerCache)
      this._cwBannerCache = this.$storeGet("sh_cw_banner_cache_v3", {}) || {};
    const cKey = `${type}_${idStr}`;
    const cached = this._cwBannerCache[cKey];
    if (cached && cached.path) {
      const imgUrl = this.getImg(cached.path, cached.kind || "backdrop");
      const logoUrl = cached.logoPath
        ? cached.logoPath.startsWith("http")
          ? cached.logoPath
          : this.getImg(cached.logoPath, "logo")
        : "";
      return { img: imgUrl, isTitledBanner: false, logoSrc: logoUrl };
    }
    const detailsEntry = this.getShowDetailsCache
      ? this.getShowDetailsCache(cKey) || this.getShowDetailsCache(idStr)
      : null;
    const data = detailsEntry?.data || null;
    const backdrops = data?.images?.backdrops || [];
    const posters = data?.images?.posters || [];
    const logos = data?.images?.logos || [];
    const cleanBd = backdrops.find(
      (b) => b.file_path && (!b.iso_639_1 || b.iso_639_1 === "xx"),
    );
    const plainBd =
      cleanBd?.file_path ||
      data?.backdrop_path ||
      item.backdrop_path ||
      backdrops[0]?.file_path ||
      "";
    const fallbackImg = plainBd
      ? { path: plainBd, kind: "backdrop" }
      : item.poster_path || data?.poster_path || posters[0]?.file_path
        ? {
            path:
              item.poster_path || data?.poster_path || posters[0]?.file_path,
            kind: "poster",
          }
        : null;
    const chosenLogo =
      logos.find((l) => l.iso_639_1 === "en") ||
      logos.find((l) => !l.iso_639_1) ||
      logos[0];
    const cachedFanart =
      this.logoCache && this.logoCache[cKey] && this.logoCache[cKey] !== "NONE"
        ? this.logoCache[cKey]
        : "";
    const logoPath = chosenLogo?.file_path || cachedFanart || "";
    if (data?.images && fallbackImg) {
      this._cwBannerCache[cKey] = {
        path: fallbackImg.path,
        kind: fallbackImg.kind,
        logoPath: logoPath,
      };
      this.$storeSet("sh_cw_banner_cache_v3", this._cwBannerCache);
    }
    const imgUrl = fallbackImg
      ? this.getImg(fallbackImg.path, fallbackImg.kind)
      : "";
    const logoUrl = logoPath
      ? logoPath.startsWith("http")
        ? logoPath
        : this.getImg(logoPath, "logo")
      : "";
    return { img: imgUrl, isTitledBanner: false, logoSrc: logoUrl };
  },
  hydrateContinueWideImg: async function (cardEl, idStr, type, title) {
    if (
      !cardEl ||
      !idStr ||
      String(idStr).startsWith("ani_") ||
      String(idStr).startsWith("tt")
    )
      return;
    if (!this._cwBannerCache)
      this._cwBannerCache = this.$storeGet("sh_cw_banner_cache_v3", {}) || {};
    const cKey = `${type}_${idStr}`;
    if (this._cwBannerCache[cKey]) return;
    try {
      const imgData = await this.api(
        `/${type}/${idStr}/images`,
        { include_image_language: "en,null,ja,ko,zh" },
        this.getTmdbMediaKey(),
      );
      if (!imgData) return;
      const backdrops = imgData.backdrops || [];
      const posters = imgData.posters || [];
      const logos = imgData.logos || [];
      const cleanBd = backdrops.find(
        (b) => b.file_path && (!b.iso_639_1 || b.iso_639_1 === "xx"),
      );
      const plainBd = cleanBd?.file_path || backdrops[0]?.file_path || "";
      const plainP = posters[0]?.file_path || "";
      const chosenLogo =
        logos.find((l) => l.iso_639_1 === "en") ||
        logos.find((l) => !l.iso_639_1) ||
        logos[0];
      let logoPath = chosenLogo?.file_path || "";
      if (
        !logoPath &&
        this.logoCache &&
        this.logoCache[cKey] &&
        this.logoCache[cKey] !== "NONE"
      ) {
        logoPath = this.logoCache[cKey];
      }
      if (
        !logoPath &&
        type === "movie" &&
        typeof this.getFanartLogo === "function"
      ) {
        const fUrl = await this.getFanartLogo("movie", idStr);
        if (fUrl) logoPath = fUrl;
      }
      let entry = null;
      if (plainBd)
        entry = { path: plainBd, kind: "backdrop", logoPath: logoPath };
      else if (plainP)
        entry = { path: plainP, kind: "poster", logoPath: logoPath };
      if (!entry) return;
      this._cwBannerCache[cKey] = entry;
      this.$storeSet("sh_cw_banner_cache_v3", this._cwBannerCache);
      const newUrl = this.getImg(entry.path, entry.kind);
      const imgEl = cardEl.querySelector(".cw-wide-bg-img");
      if (imgEl && imgEl.src !== newUrl) {
        imgEl.src = newUrl;
      }
      const innerEl = cardEl.querySelector(".cw-wide-inner");
      if (innerEl) innerEl.classList.add("has-center-title");
      const bodyEl = cardEl.querySelector(".cw-wide-body");
      if (bodyEl) {
        const safeTitle = (title || "").replace(/"/g, "&quot;");
        const safeJsTitle = (title || "")
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");
        const tLen = (title || "").length;
        const ftCls =
          "cw-wide-fallback-title" +
          (tLen > 42 ? " is-extra-long" : tLen > 24 ? " is-long" : "");
        const logoUrl = entry.logoPath
          ? entry.logoPath.startsWith("http")
            ? entry.logoPath
            : this.getImg(entry.logoPath, "logo")
          : "";
        if (logoUrl) {
          bodyEl.innerHTML =
            '<img src="' +
            logoUrl +
            '" class="cw-wide-logo loaded" alt="' +
            safeTitle +
            "\" onerror=\"this.outerHTML='<div class=\\'" +
            ftCls +
            "\\'>" +
            safeJsTitle +
            "</div>'\">";
        } else {
          bodyEl.innerHTML =
            '<div class="' + ftCls + '">' + (title || "") + "</div>";
        }
      }
    } catch (e) {}
  },
  buildContinueWideCard: function (item) {
    if (!item || !item.id || (!item.poster_path && !item.backdrop_path))
      return "";
    const type = item.media_type || (item.name ? "tv" : "movie");
    if (this.isUserBlocked && this.isUserBlocked(item, type)) return "";
    const idStr = String(item.id);
    const title = item.title || item.name || "";
    const safeTitle = title.replace(/"/g, "&quot;");
    const safeJsTitle = title.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const media = this.resolveContinueWideMedia(item, type, idStr);
    const img = media.img;
    let watchS = 1;
    let watchE = 1;
    let hybridArg = "null";
    let btnLabel = "Resume";
    if (type === "tv") {
      watchS = parseInt(item.last_season, 10) || 1;
      watchE = parseInt(item.last_episode, 10) || 1;
      if (
        item.last_hybrid_season !== null &&
        item.last_hybrid_season !== undefined
      ) {
        hybridArg = String(item.last_hybrid_season);
      }
      const epPrefix = item.is_special
        ? "E" + watchE
        : "S" + watchS + " E" + watchE;
      btnLabel = "Resume " + epPrefix;
    }
    let centerHtml = "";
    if (!media.isTitledBanner) {
      const ftCls =
        "cw-wide-fallback-title" +
        (title.length > 42
          ? " is-extra-long"
          : title.length > 24
            ? " is-long"
            : "");
      if (media.logoSrc) {
        centerHtml =
          '<img src="' +
          media.logoSrc +
          '" class="cw-wide-logo loaded" alt="' +
          safeTitle +
          "\" onerror=\"this.outerHTML='<div class=\\'" +
          ftCls +
          "\\'>" +
          safeJsTitle +
          "</div>'\">";
      } else {
        centerHtml = '<div class="' + ftCls + '">' + title + "</div>";
      }
    }
    const innerCls = media.isTitledBanner
      ? "cw-wide-inner"
      : "cw-wide-inner has-center-title";
    const playSvg =
      typeof PAUSE_BTN_SVG === "function"
        ? PAUSE_BTN_SVG(14, 14)
        : PAUSE_BTN_SVG;
    const posterAttr = img ? ' data-bg-src="' + img + '"' : "";
    return (
      '<div class="cw-wide-card clickable" data-show-id="' +
      idStr +
      '" data-show-title="' +
      safeTitle +
      '"' +
      posterAttr +
      " onclick=\"app.openShowinfo('" +
      idStr +
      "','" +
      type +
      "')\">" +
      '<div class="cw-wide-top">' +
      '<div class="' +
      innerCls +
      '">' +
      '<img src="' +
      img +
      '" class="cw-wide-bg-img poster-img" loading="lazy" alt="' +
      safeTitle +
      '">' +
      '<div class="cw-wide-overlay"></div>' +
      '<div class="cw-wide-body">' +
      centerHtml +
      "</div>" +
      '<button type="button" class="cw-wide-rm-btn" onclick="event.stopPropagation();app.removeFromHistory(\'' +
      idStr +
      '\')" title="Remove">&times;</button>' +
      "</div>" +
      "</div>" +
      '<button type="button" class="cw-wide-play-btn" onclick="event.stopPropagation();app.openWatch(\'' +
      idStr +
      "','" +
      type +
      "'," +
      watchS +
      "," +
      watchE +
      ",true,false," +
      hybridArg +
      ')">' +
      playSvg +
      "<span>" +
      btnLabel +
      "</span></button>" +
      "</div>"
    );
  },
  updateContinueWatching: function () {
    const hist = this.getHistory();
    const sec = this.$g("continue-watching-section");
    const row = this.$g("row-continue");
    if (hist.length > 0) {
      if (sec) sec.style.display = "block";
      if (row) {
        const useWide = !this.uiPrefs || this.uiPrefs.cwWideCard !== false;
        row.classList.toggle("cw-wide-mode", useWide);
        row.classList.toggle("cw-count-1", useWide && hist.length === 1);
        row.classList.toggle("cw-count-2", useWide && hist.length === 2);
        const newHtml = useWide
          ? hist
              .slice(0, 10)
              .map((i) => this.buildContinueWideCard(i))
              .join("")
          : hist
              .slice(0, 10)
              .map((i) => this.buildCard(i, null, true))
              .join("");
        if (row.innerHTML !== newHtml) {
          row.innerHTML = newHtml;
          this.markImgsLoaded(row.querySelectorAll("img"));
          if (useWide) {
            row
              .querySelectorAll(".cw-wide-card[data-show-id]")
              .forEach((card) => {
                const sId = card.getAttribute("data-show-id");
                const sTitle = card.getAttribute("data-show-title") || "";
                const sType = card.getAttribute("onclick")?.includes("'tv'")
                  ? "tv"
                  : "movie";
                this.hydrateContinueWideImg(card, sId, sType, sTitle);
              });
          }
        }
      }
    } else if (sec) {
      sec.style.display = "none";
    }
    if (row) setTimeout(() => this.checkScrollArrow(row), 150);
  },
  startDominoTimer(delay = 3 * 60 * 1000) {
    this.stopDominoTimer();
    if (!this.uiPrefs || !this.uiPrefs.randomHome) return;
    this.dominoTimer = setTimeout(() => this.runDominoStep(0), delay);
  },
  stopDominoTimer() {
    if (this.dominoTimer) {
      clearTimeout(this.dominoTimer);
      this.dominoTimer = null;
    }
  },
  async runDominoStep(stepIdx) {
    this.stopDominoTimer();
    if (!this.uiPrefs || !this.uiPrefs.randomHome) return;
    const step = this.dominoSteps[stepIdx];
    if (!step) return;
    try {
      const items = await this.fetchShowcaseItems(step.ep, step.params, true);
      await this.renderSingleShowcaseRow(step.id, items, step.type);
      if (step.id === "row-trend-movies") {
        if (!this.heroSourceItems) this.heroSourceItems = {};
        this.heroSourceItems.movie = items;
      } else if (step.id === "row-trend-series") {
        if (!this.heroSourceItems) this.heroSourceItems = {};
        this.heroSourceItems.tv = items;
      }
    } catch (e) {}
    const nextIdx = (stepIdx + 1) % this.dominoSteps.length;
    this.dominoTimer = setTimeout(
      () => this.runDominoStep(nextIdx),
      step.delayAfter,
    );
  },
  startHeroDominoTimer(delay = 2 * 60 * 1000) {
    this.stopHeroDominoTimer();
    this.heroDominoTimer = setTimeout(() => this.runHeroDominoStep(0), delay);
  },
  stopHeroDominoTimer() {
    if (this.heroDominoTimer) {
      clearTimeout(this.heroDominoTimer);
      this.heroDominoTimer = null;
    }
  },
  preloadHeroMedia(hero, timeoutMs = 4000) {
    if (!hero) return Promise.resolve();
    if (!this._preloadedHeroUrls) this._preloadedHeroUrls = new Set();
    const urls = [];
    const logoSrc = hero.logo_path
      ? this.getImg(hero.logo_path, "logo")
      : hero.fanart_logo;
    const bgUrl = hero.backdrop_path
      ? this.getImg(hero.backdrop_path, "backdrop")
      : "";
    if (logoSrc && !this._preloadedHeroUrls.has(logoSrc)) urls.push(logoSrc);
    if (bgUrl && !this._preloadedHeroUrls.has(bgUrl)) urls.push(bgUrl);
    if (urls.length === 0) return Promise.resolve();
    return Promise.all(
      urls.map(
        (u) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              this._preloadedHeroUrls.add(u);
              resolve();
            };
            const img = new Image();
            img.onload = finish;
            img.onerror = finish;
            img.src = u;
            if (img.complete && img.naturalWidth > 0) finish();
            else setTimeout(finish, timeoutMs);
          }),
      ),
    );
  },
  preloadRemainingHeroSlots(activeIdx = 0) {
    if (!Array.isArray(this.heroItems) || this.heroItems.length <= 1) return;
    this.heroItems.forEach((item, i) => {
      if (i !== activeIdx && item) this.preloadHeroMedia(item, 8000);
    });
  },
  waitForVisibleRowImgs(rowIds, timeoutMs = 12000) {
    const urls = new Set();
    (rowIds || []).slice(0, 2).forEach((id) => {
      const row = this.$g(id);
      if (!row) return;
      Array.from(row.querySelectorAll(".poster-img"))
        .slice(0, 8)
        .forEach((img) => {
          const u = img.getAttribute("src") || img.dataset?.src;
          if (u) urls.add(u);
        });
    });
    if (urls.size === 0) return Promise.resolve();
    return Promise.all(
      Array.from(urls).map(
        (u) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };
            const pre = new Image();
            pre.onload = finish;
            pre.onerror = finish;
            pre.src = u;
            if (pre.complete && pre.naturalWidth > 0) finish();
            else setTimeout(finish, timeoutMs);
          }),
      ),
    );
  },
  async preloadHomeRowImgs(rowIds) {
    const urls = [];
    const seen = new Set();
    (rowIds || []).forEach((id) => {
      const row = this.$g(id);
      if (!row) return;
      row.querySelectorAll(".poster-img").forEach((img) => {
        if (img.loading === "lazy") img.loading = "eager";
        const u = img.getAttribute("src") || img.dataset?.src;
        if (u && !img.complete && !seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      });
    });
    for (let i = 0; i < urls.length; i += 6) {
      if (this.currentView !== "home") return;
      await Promise.all(
        urls.slice(i, i + 6).map(
          (u) =>
            new Promise((res) => {
              const pre = new Image();
              pre.onload = res;
              pre.onerror = res;
              pre.src = u;
              if (pre.complete) res();
            }),
        ),
      );
    }
  },
  async runHeroDominoStep(stepIdx) {
    this.stopHeroDominoTimer();
    const step = this.heroDominoSteps[stepIdx];
    if (!step) return;
    try {
      let pool = this.heroSourceItems && this.heroSourceItems[step.type];
      if (!pool || pool.length === 0) {
        pool = await this.fetchShowcaseItems(
          step.type === "movie" ? "/trending/movie/day" : "/trending/tv/day",
          {},
          true,
        );
        if (!this.heroSourceItems) this.heroSourceItems = {};
        this.heroSourceItems[step.type] = pool;
      }
      const existingIds = new Set(
        (this.heroItems || []).map((h) => String(h.id)),
      );
      const candidates = [...pool]
        .filter(
          (i) =>
            !existingIds.has(String(i.id)) && !this.isBlocked(i, step.type),
        )
        .sort(() => Math.random() - 0.5);
      let newItem = null;
      for (const cand of candidates) {
        const res = await this.resolveHeroItem(cand, step.type);
        if (res) {
          newItem = res;
          break;
        }
      }
      if (newItem) {
        await this.preloadHeroMedia(newItem, 4000);
        if (!this.heroItems) this.heroItems = [];
        if (step.slot < this.heroItems.length) {
          this.heroItems[step.slot] = newItem;
          if (this.heroIdx === step.slot && this.currentView === "home") {
            this.setHero(step.slot);
          }
        } else if (this.heroItems.length < 6) {
          this.heroItems.push(newItem);
          if (this.$g("hero-indicators")) {
            this.$g("hero-indicators").innerHTML = this.heroItems
              .map(
                (_, i) =>
                  `<div class="hero-dot${i === this.heroIdx ? " active" : ""}" onclick="app.setHero(${i})"></div>`,
              )
              .join("");
          }
        }
      }
    } catch (e) {}
    const nextIdx = (stepIdx + 1) % this.heroDominoSteps.length;
    this.heroDominoTimer = setTimeout(
      () => this.runHeroDominoStep(nextIdx),
      step.delayAfter,
    );
  },
  async renderSingleShowcaseRow(rowId, items, type) {
    const row = this.$g(rowId);
    if (!row) return;
    const urls = (items || [])
      .map((it) =>
        it && it.poster_path ? this.getImg(it.poster_path, "poster") : "",
      )
      .filter(Boolean);
    for (let i = 0; i < urls.length; i += 6) {
      if (this.currentView !== "home") return;
      await Promise.all(
        urls.slice(i, i + 6).map(
          (u) =>
            new Promise((res) => {
              let done = false;
              const finish = () => {
                if (!done) {
                  done = true;
                  res();
                }
              };
              const pre = new Image();
              pre.onload = finish;
              pre.onerror = finish;
              pre.src = u;
              if (pre.complete && pre.naturalWidth > 0) finish();
              else setTimeout(finish, 6000);
            }),
        ),
      );
    }
    row.innerHTML = this.makeInfRow(items, type);
    row.querySelectorAll(".poster-img").forEach((img) => {
      if (img.loading === "lazy") img.loading = "eager";
    });
    const unit = row.scrollWidth / 3;
    if (unit > 0) row.scrollLeft = unit;
    this.markImgsLoaded(row.querySelectorAll(".poster-img"));
  },
  async animateRowLeftToRight(rowEl) {
    if (!rowEl) return;
    if (this.uiPrefs && this.uiPrefs.turnOffAnim) {
      this.markImgsLoaded(rowEl.querySelectorAll(".poster-img"));
      return;
    }
    const cards = Array.from(rowEl.querySelectorAll(".poster-card"));
    if (cards.length === 0) return;
    const vpWidth =
      window.innerWidth || document.documentElement.clientWidth || 800;
    const visibleCards = [];
    const otherImgs = [];
    cards.forEach((c) => {
      const rect = c.getBoundingClientRect();
      const img = c.querySelector(".poster-img");
      if (rect.right >= -40 && rect.left <= vpWidth + 60) {
        visibleCards.push({ left: rect.left, img: img });
      } else if (img) {
        otherImgs.push(img);
      }
    });
    visibleCards.sort((a, b) => a.left - b.left);
    const targets = (
      visibleCards.length > 0
        ? visibleCards.map((v) => v.img)
        : cards.slice(0, 10).map((c) => c.querySelector(".poster-img"))
    ).filter(Boolean);
    this.markImgsLoaded(otherImgs);
    this.markImgsLoaded(targets, 30);
  },
  async loadHome(force = false) {
    clearTimeout(this._homeLoadedSafetyTimer);
    this._homeLoadedSafetyTimer = setTimeout(() => {
      const vh = this.$g("view-home");
      if (vh && !vh.classList.contains("loaded")) {
        vh.classList.add("loaded");
      }
    }, 25000);
    this.updateContinueWatching();
    const isRand = !!(this.uiPrefs && this.uiPrefs.randomHome);
    if (
      !force &&
      this.homeLoaded &&
      this.$g("row-trend-movies").innerHTML !== ""
    ) {
      this.startRowAutoSlide();
      this.startHeroTimer();
      return;
    }
    this.stopDominoTimer();
    this.stopHeroDominoTimer();
    const now = Date.now();
    const cached = this.$storeGet("cached_home_showcase", null);
    const hasData = !!(
      cached &&
      Array.isArray(cached.trM) &&
      cached.trM.length > 0
    );
    if (
      !force &&
      hasData &&
      now - (cached.timestamp || 0) < (isRand ? 5 * 60 * 1000 : 15 * 60 * 1000)
    ) {
      await this.renderHomeContent(
        cached.trM,
        cached.trS,
        cached.topM,
        cached.topS,
        cached.heroCandidatesM || [],
        cached.heroCandidatesS || [],
        cached.cachedHeroItems || null,
      );
      this.homeLoaded = true;
      this.startDominoTimer(3 * 60 * 1000);
      return;
    }
    const [trM, trS, topM, topS] = await Promise.all([
      this.fetchShowcaseItems("/trending/movie/day", {}, isRand, force),
      this.fetchShowcaseItems("/trending/tv/day", {}, isRand, force),
      this.fetchShowcaseItems(
        "/discover/movie",
        {
          sort_by: "revenue.desc",
        },
        isRand,
        force,
      ),
      this.fetchShowcaseItems(
        "/discover/tv",
        {
          sort_by: "vote_count.desc",
        },
        isRand,
        force,
      ),
    ]);
    const mCandidates = trM
      .filter((i) => !this.isBlocked(i, "movie"))
      .slice(0, 10);
    const sCandidates = trS
      .filter((i) => !this.isBlocked(i, "tv"))
      .slice(0, 10);
    await this.renderHomeContent(
      trM,
      trS,
      topM,
      topS,
      mCandidates,
      sCandidates,
    );
    const scData = {
      timestamp: now,
      trM,
      trS,
      topM,
      topS,
      heroCandidatesM: mCandidates,
      heroCandidatesS: sCandidates,
      cachedHeroItems: this.heroItems || [],
    };
    this.$storeSet("cached_home_showcase", scData);
    this.homeLoaded = true;
    this.startDominoTimer(3 * 60 * 1000);
  },
  async renderHomeContent(
    trM,
    trS,
    topM,
    topS,
    mCandidates,
    sCandidates,
    cachedHeroItems = null,
  ) {
    const rowIds = [
      "row-trend-movies",
      "row-trend-series",
      "row-top-movies",
      "row-top-series",
    ];
    [
      ["row-trend-movies", trM, "movie"],
      ["row-trend-series", trS, "tv"],
      ["row-top-movies", topM, "movie"],
      ["row-top-series", topS, "tv"],
    ].forEach(([id, items, type]) => {
      const row = this.$g(id);
      if (row) row.innerHTML = this.makeInfRow(items, type);
    });
    this.heroSourceItems = {
      movie: trM || [],
      tv: trS || [],
    };
    if (
      cachedHeroItems &&
      Array.isArray(cachedHeroItems) &&
      cachedHeroItems.length > 0
    ) {
      this.heroItems = cachedHeroItems;
    } else {
      const mPool = [
        ...(mCandidates && mCandidates.length > 0 ? mCandidates : trM || []),
      ].sort(() => Math.random() - 0.5);
      const sPool = [
        ...(sCandidates && sCandidates.length > 0 ? sCandidates : trS || []),
      ].sort(() => Math.random() - 0.5);
      const resolveHeroGroup = async (items, type) => {
        const pool = items.slice(0, 6);
        const resolved = await Promise.all(
          pool.map((it) => this.resolveHeroItem(it, type)),
        );
        return resolved.filter(Boolean).slice(0, 3);
      };
      const [mHero, sHero] = await Promise.all([
        resolveHeroGroup(mPool, "movie"),
        resolveHeroGroup(sPool, "tv"),
      ]);
      const orderedHero = [];
      for (let i = 0; i < 3; i++) {
        if (mHero[i]) orderedHero.push(mHero[i]);
        if (sHero[i]) orderedHero.push(sHero[i]);
      }
      this.heroItems = orderedHero;
    }
    await Promise.all([
      this.heroItems.length > 0
        ? this.preloadHeroMedia(this.heroItems[0], 12000)
        : Promise.resolve(),
      this.waitForVisibleRowImgs(rowIds, 12000),
    ]);
    clearTimeout(this._homeLoadedSafetyTimer);
    this.$g("view-home")?.classList.add("loaded");
    this.updateArrows();
    if (typeof this.initAndroidPromoBanner === "function")
      this.initAndroidPromoBanner();
    this.startRowAutoSlide();
    if (this.heroItems.length > 0) {
      if (this.$g("hero-indicators")) {
        this.$g("hero-indicators").innerHTML = this.heroItems
          .map(
            (_, i) =>
              `<div class="hero-dot" onclick="app.setHero(${i})"></div>`,
          )
          .join("");
      }
      this.heroIdx = 0;
      this.setHero(0);
      this.preloadRemainingHeroSlots(0);
    }
    this.startHeroDominoTimer();
    await Promise.all(
      rowIds.map((id) => this.animateRowLeftToRight(this.$g(id))),
    );
    this.preloadHomeRowImgs(rowIds);
  },
  initExploreMulti: function () {
    if (!this.exploreMulti) {
      const def = () => Object.fromEntries(this.filterKeys.map((k) => [k, []]));
      this.exploreMulti = {
        movie: def(),
        tv: def(),
        person: def(),
        company: def(),
      };
    }
    const p = this.$storeGet("explorePrefs", null);
    if (p) {
      ["movie", "tv", "person", "company"].forEach((t) => {
        if (p && p[t]) {
          this.filterKeys.forEach((k) => {
            if (Array.isArray(p[t][k])) {
              this.exploreMulti[t][k] = p[t][k];
            } else if (
              p[t][k] &&
              typeof p[t][k] === "string" &&
              p[t][k] !== "all"
            ) {
              const nameKey = k + "Name";
              this.exploreMulti[t][k] = [
                {
                  id: p[t][k],
                  name: p[t][nameKey] || p[t][k],
                },
              ];
            }
          });
        }
      });
    }
  },
  getMultiList: function (key, typeOverride = null, scope = "explore") {
    if (typeOverride === "block" || scope === "block") {
      if (!this.blockMulti)
        this.blockMulti = Object.fromEntries(
          this.blockKeys.map((k) => [k, []]),
        );
      if (!this.blockMulti[key]) this.blockMulti[key] = [];
      return this.blockMulti[key];
    }
    if (scope === "person") {
      if (!this.personMulti)
        this.personMulti = { genre: [], year: [], country: [] };
      if (!this.personMulti[key]) this.personMulti[key] = [];
      return this.personMulti[key];
    }
    if (scope === "source") {
      if (!this.sourceMulti)
        this.sourceMulti = { genre: [], year: [], country: [], person: [] };
      if (!this.sourceMulti[key]) this.sourceMulti[key] = [];
      return this.sourceMulti[key];
    }
    const t = typeOverride || this.exploreType;
    if (!this.exploreMulti) this.initExploreMulti();
    if (!this.exploreMulti[t])
      this.exploreMulti[t] = Object.fromEntries(
        this.filterKeys.map((k) => [k, []]),
      );
    return this.exploreMulti[t][key] || [];
  },
  resetExploreKeys(t, keysToClear, invalidTypes = []) {
    keysToClear.forEach((k) => {
      if (this.exploreMulti?.[t]) this.exploreMulti[t][k] = [];
      this.renderFilterTags(k, "explore");
    });
    if (
      invalidTypes.length > 0 &&
      invalidTypes.includes(this.$g("filter-type")?.value)
    ) {
      const tInp = this.$g("filter-type-input"),
        tClr = this.$g("filter-type-clear"),
        tHidden = this.$g("filter-type");
      if (tHidden) tHidden.value = "all";
      if (tInp) tInp.value = "";
      if (tClr) tClr.style.display = "none";
      this.updateTypeInputWidth("explore");
    }
  },
  _clearFilterInputDrop: function (key, scope = "explore") {
    const fieldKey = this.getFieldKey ? this.getFieldKey(key) : key;
    const isBlock = scope === "block";
    const isPerson = scope === "person";
    const isSource = scope === "source";
    const pfx = isBlock
      ? "bc-"
      : isPerson
        ? "pf-"
        : isSource
          ? "sf-"
          : "filter-";
    const drop = this.$g(`${pfx}${fieldKey}-drop`);
    if (drop) {
      drop.style.display = "none";
      drop.innerHTML = "";
    }
    const inp = this.$g(`${pfx}${fieldKey}-input`);
    if (inp) inp.value = "";
  },
  addMultiFilter: function (key, id, name, dept = "", scope = "explore") {
    const isBlock = scope === "block";
    const isPerson = scope === "person";
    const isSource = scope === "source";
    const t = this.exploreType;
    this._clearFilterInputDrop(key, scope);
    if (!id || id === "all") {
      if (isBlock) {
        if (this.blockMulti) this.blockMulti[key] = [];
        if (key === "genre" && this.blockMulti) {
          this.blockMulti.genre2 = [];
          this.renderFilterTags("genre2", "block");
        }
      } else if (isPerson) {
        if (this.personMulti) this.personMulti[key] = [];
      } else if (isSource) {
        if (this.sourceMulti) this.sourceMulti[key] = [];
      } else {
        if (this.exploreMulti && this.exploreMulti[t])
          this.exploreMulti[t][key] = [];
        if (key === "genre") {
          this.resetExploreKeys(
            t,
            ["genre2", "aniTag", "season", "aniStudio", "aniStaff"],
            ["specials"],
          );
        }
      }
      if (!isPerson && !isSource) this.updateGenre2Visibility();
      this.renderFilterTags(key, scope);
      if (isPerson) {
        this.applyPersonFilters();
      } else if (isSource) {
        this.applySourceFilters();
      } else if (!isBlock) {
        this.updatePersonRoleVisibility();
        this.saveExplorePrefs();
        this.resetExplore();
      }
      return;
    }
    if (
      !isBlock &&
      !isPerson &&
      !isSource &&
      key === "genre" &&
      id === "anime"
    ) {
      this.exploreMulti[t][key] = [
        { id: "anime", name: String(name || "Anime") },
      ];
      this.resetExploreKeys(t, ["compNet", "person"], ["top_rated", "revenue"]);
      this.personRoleFilter = null;
      this.exploreMulti[t].country = (
        this.exploreMulti[t].country || []
      ).filter((c) => ["CN", "JP", "KR"].includes(c.id));
      this.renderFilterTags("country", "explore");
    } else {
      const list = isBlock
        ? this.getMultiList(key, "block")
        : isPerson
          ? this.getMultiList(key, null, "person")
          : isSource
            ? this.getMultiList(key, null, "source")
            : this.getMultiList(key, t);
      if (!list.some((item) => String(item.id) === String(id))) {
        list.push(
          isBlock
            ? { id: String(id), name: String(name || id) }
            : {
                id: String(id),
                name: String(name || id),
                dept: String(dept || ""),
              },
        );
      }
    }
    if (!isPerson && !isSource) this.updateGenre2Visibility();
    this.renderFilterTags(key, scope);
    if (isPerson) {
      this.applyPersonFilters();
    } else if (isSource) {
      this.applySourceFilters();
    } else if (!isBlock) {
      this.updatePersonRoleVisibility();
      this.saveExplorePrefs();
      this.resetExplore();
    }
  },
  removeMultiFilter: function (key, id, scope = "explore") {
    const isBlock = scope === "block";
    const isPerson = scope === "person";
    const isSource = scope === "source";
    const t = this.exploreType;
    const list = isBlock
      ? this.getMultiList(key, "block")
      : isPerson
        ? this.getMultiList(key, null, "person")
        : isSource
          ? this.getMultiList(key, null, "source")
          : this.getMultiList(key, t);
    const idx = list.findIndex((item) => String(item.id) === String(id));
    if (idx > -1) {
      list.splice(idx, 1);
      if (
        !isBlock &&
        !isPerson &&
        !isSource &&
        key === "genre" &&
        id === "anime"
      ) {
        const hasAnime = list.some((item) => item.id === "anime");
        if (!hasAnime) {
          if (isBlock) {
            if (this.blockMulti) this.blockMulti.genre2 = [];
            this.renderFilterTags("genre2", "block");
          } else {
            this.resetExploreKeys(
              t,
              ["genre2", "aniTag", "season", "aniStudio", "aniStaff"],
              ["specials"],
            );
            this.aniStaffRoleFilter = null;
          }
        }
      }
      if (!isPerson && !isSource) this.updateGenre2Visibility();
      this.renderFilterTags(key, scope);
      if (isPerson) {
        this.applyPersonFilters();
      } else if (isSource) {
        this.applySourceFilters();
      } else if (!isBlock) {
        this.updatePersonRoleVisibility();
        this.saveExplorePrefs();
        this.resetExplore();
      }
    }
  },
  removePersonFilter: function (key, id) {
    this.removeMultiFilter(key, id, "person");
  },
  removeSourceFilter: function (key, id) {
    this.removeMultiFilter(key, id, "source");
  },
  removeBlockFilter: function (key, id) {
    this.removeMultiFilter(key, id, "block");
  },
  toggleAnimeExplore: function () {
    const t = this.exploreType;
    const hasAnime = this.getMultiList("genre").some(
      (item) => item.id === "anime",
    );
    const tId = this.$g("filter-type");
    const tInp = this.$g("filter-type-input");
    const tClr = this.$g("filter-type-clear");
    if (tId) tId.value = "all";
    if (tInp) tInp.value = "";
    if (tClr) tClr.style.display = "none";
    this.updateTypeInputWidth();
    if (this.exploreMulti && this.exploreMulti[t]) {
      this.filterKeys.forEach((k) => {
        this.exploreMulti[t][k] = [];
      });
    }
    this.filterKeys.forEach((k) => {
      const inp = this.$g(`filter-${this.getFieldKey(k)}-input`);
      if (inp) inp.value = "";
    });
    this.yearSortOrder = null;
    this.personRoleFilter = null;
    this.aniStaffRoleFilter = null;
    if (hasAnime) {
      this.updateGenre2Visibility();
      this.renderAllFilterTags();
      this.updatePersonRoleVisibility();
      this.saveExplorePrefs();
      this.resetExplore();
    } else {
      this.addMultiFilter("genre", "anime", "Anime");
    }
    this.updateAnimeBtnUI();
  },
  updateAnimeBtnUI: function () {
    const btn = this.$g("btn-explore-anime");
    if (!btn) return;
    const hasAnime = this.getMultiList("genre").some(
      (item) => item.id === "anime",
    );
    btn.classList.toggle("active", hasAnime);
  },
  shuffleArray: function (arr) {
    if (!Array.isArray(arr)) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  },
  updateRandomBtnUI: function () {
    const btn = this.$g("btn-explore-random");
    if (!btn) return;
    btn.classList.toggle("active", Boolean(this.exploreRandomActive));
  },
  resetExploreRandom: function (skipUI = false) {
    this.exploreRandomActive = false;
    this.exploreRandomPool = [];
    this.exploreRandomAniPool = [];
    this.exploreRandomPersonList = null;
    if (!skipUI) this.updateRandomBtnUI();
  },
  toggleExploreRandom: function () {
    this.exploreRandomActive = !this.exploreRandomActive;
    this.exploreRandomPool = [];
    this.exploreRandomAniPool = [];
    this.exploreRandomPersonList = null;
    this.updateRandomBtnUI();
    this.resetExplore(false);
  },
  updateGenre2Visibility: function () {
    const hasAnime = this.getMultiList("genre").some(
      (item) => item.id === "anime",
    );
    this.updateAnimeBtnUI();
    const bcHasAnime = this.getMultiList("genre", "block").some(
      (item) => item.id === "anime",
    );
    const map = {
      "filter-genre-wrap": !hasAnime,
      "filter-genre2-wrap": hasAnime,
      "filter-ani-tag-wrap": hasAnime,
      "filter-season-wrap": hasAnime,
      "filter-ani-studio-wrap": hasAnime,
      "filter-ani-staff-group": hasAnime,
      "filter-ani-staff-wrap": hasAnime,
      "filter-comp-net-wrap": !hasAnime,
      "filter-person-group": !hasAnime,
      "filter-person-wrap": !hasAnime,
      "bc-genre2-wrap": bcHasAnime,
    };
    for (const id in map) {
      const el = this.$g(id);
      if (el) {
        if (id.startsWith("filter-")) {
          if (this.exploreType === "person" || this.exploreType === "company")
            continue;
          el.style.display =
            this.exploreFilterExpanded && map[id] ? "inline-flex" : "none";
        } else {
          el.style.display = map[id] ? "inline-flex" : "none";
        }
      }
    }
  },
  renderFilterTags: function (key, scope = "explore") {
    const isBlock = scope === "block";
    const isPerson = scope === "person";
    const isSource = scope === "source";
    const fieldKey = this.getFieldKey(key);
    const prefix = isBlock
      ? "bc"
      : isPerson
        ? "pf"
        : isSource
          ? "sf"
          : "filter";
    const cont = this.$g(`${prefix}-${fieldKey}-tags`);
    if (!cont) return;
    const list = this.getMultiList(
      key,
      isBlock ? "block" : isPerson ? "person" : isSource ? "source" : null,
      scope,
    );
    const removeFn = isBlock
      ? "app.removeBlockFilter"
      : isPerson
        ? "app.removePersonFilter"
        : isSource
          ? "app.removeSourceFilter"
          : "app.removeMultiFilter";
    const isAnimeGenre =
      !isBlock &&
      !isPerson &&
      !isSource &&
      key === "genre" &&
      list.some((item) => item.id === "anime");
    const tagsHtml = list
      .filter(
        (item) =>
          isBlock ||
          isPerson ||
          isSource ||
          key !== "genre" ||
          item.id !== "anime",
      )
      .map(
        (item) =>
          `<span class="filter-tag"><span style="pointer-events:none;">${item.name}</span><button type="button" class="filter-tag-del" onclick="event.stopPropagation();${removeFn}('${key}','${item.id}')">&times;</button></span>`,
      )
      .join("");
    const addBtnHtml =
      list.length > 0 && !isAnimeGenre
        ? `<span class="filter-add-btn" id="${prefix}-${fieldKey}-add-btn">${PLUS_SVG(11, 11, 4)}</span>`
        : "";
    cont.innerHTML = tagsHtml + addBtnHtml;
    const inp = this.$g(`${prefix}-${fieldKey}-input`);
    const btn = this.$g(`${prefix}-${fieldKey}-add-btn`);
    const box = inp ? inp.closest(".filter-multi-box") : null;
    const boxWidthMap = {
      season: "84px",
      year: "72px",
      genre: "84px",
      genre2: "84px",
      aniTag: "112px",
      "exp-role": this.exploreType === "company" ? "84px" : "114px",
      compNet: isPerson ? "98px" : isBlock ? "140px" : "98px",
      country: "98px",
      person: "126px",
      aniStudio: "98px",
      aniStaff: "98px",
    };
    const defBoxWidth = boxWidthMap[key] || "88px";
    const effectiveList =
      !isBlock && !isPerson && !isSource && key === "genre"
        ? list.filter((item) => item.id !== "anime")
        : list;
    if (box) {
      box.style.width = effectiveList.length > 0 ? "fit-content" : defBoxWidth;
    }
    if (inp) {
      this.syncMultiInputUI(inp);
      if (effectiveList.length === 0) {
        const defaults = {
          season: "Season",
          genre: "Genre",
          genre2: "Genre",
          aniTag: "Tags",
          "exp-role": this.exploreType === "company" ? "Type" : "Department",
          year: "Year",
          country: "Country",
          compNet: isPerson
            ? "Network"
            : isBlock
              ? "Studio / Network"
              : this.exploreType === "movie"
                ? "Studio"
                : "Network",
          person: "Cast & Crew",
          aniStudio: "Studios",
          aniStaff: "Staff",
        };
        const defText = defaults[key] || "";
        inp.style.display = "inline-block";
        inp.placeholder =
          key === "aniTag" && document.activeElement === inp
            ? 'e.g. "Isekai"'
            : defText;
        if (key === "aniTag" && !inp._hasAniTagPlaceholder) {
          inp._hasAniTagPlaceholder = true;
          inp.addEventListener("focus", () => {
            if (
              inp.closest(".filter-multi-box")?.querySelectorAll(".filter-tag")
                .length === 0
            )
              inp.placeholder = 'e.g. "Isekai"';
          });
          inp.addEventListener("blur", () => {
            if (
              inp.closest(".filter-multi-box")?.querySelectorAll(".filter-tag")
                .length === 0
            )
              inp.placeholder = "Tags";
          });
        }
        inp.style.width = "100%";
        inp.style.minWidth = "0";
        inp.style.padding = "0 4px";
      }
    }
  },
  renderAllFilterTags: function (scope = "explore") {
    if (scope === "person") {
      ["genre", "year", "country"].forEach((k) =>
        this.renderFilterTags(k, "person"),
      );
      return;
    }
    if (scope === "source") {
      ["genre", "year", "country", "person"].forEach((k) =>
        this.renderFilterTags(k, "source"),
      );
      return;
    }
    this.updateGenre2Visibility();
    const keys = scope === "block" ? this.blockKeys : this.filterKeys;
    keys.forEach((k) => this.renderFilterTags(k, scope));
  },
  personFilterKeys: ["genre", "year", "country"],
  sourceFilterKeys: ["genre", "year", "country", "person"],
  togglePersonFilterBar: function (forceState = null) {
    const bar = this.$g("person-catalog-filter-bar");
    const prevHeight = bar ? bar.offsetHeight : 0;
    this.personFilterExpanded =
      forceState !== null ? forceState : !this.personFilterExpanded;
    const boxesWrap =
      this.$g("pf-boxes-wrap") ||
      bar?.querySelector(".explore-filter-boxes-wrap");
    if (this.personFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-up");
      boxesWrap.classList.add("slide-down");
    } else if (!this.personFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-down");
      boxesWrap.classList.add("slide-up");
    }
    this.updatePersonFilterToggleUI();
    if (bar && prevHeight) {
      const newHeight = bar.offsetHeight;
      if (prevHeight !== newHeight) {
        bar.style.height = prevHeight + "px";
        bar.getBoundingClientRect();
        bar.classList.add("animating");
        bar.style.height = newHeight + "px";
        const onEnd = (e) => {
          if (e.target !== bar || e.propertyName !== "height") return;
          bar.removeEventListener("transitionend", onEnd);
          bar.classList.remove("animating");
          bar.style.height = "";
          if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
        };
        bar.addEventListener("transitionend", onEnd);
        setTimeout(() => {
          if (bar.classList.contains("animating")) {
            bar.classList.remove("animating");
            bar.style.height = "";
            if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
          }
        }, 320);
      }
    }
  },
  updatePersonFilterToggleUI: function () {
    const toggleBtn = this.$g("btn-person-filter-toggle");
    const bar = this.$g("person-catalog-filter-bar");
    const infoWrap = this.$g("person-filter-minimized-info");
    const clearBtn = this.$g("pf-clear-all-btn");
    if (!toggleBtn || !bar) return;
    const curType = this.$g("pf-type")?.value;
    const isTypeCustom = Boolean(curType);
    const hasMulti = this.personFilterKeys.some(
      (k) => this.getMultiList(k, null, "person").length > 0,
    );
    const hasActive = isTypeCustom || hasMulti;
    toggleBtn.classList.toggle("active", Boolean(this.personFilterExpanded));
    if (this.personFilterExpanded) {
      if (infoWrap) {
        infoWrap.innerHTML = "";
        infoWrap.style.display = "none";
      }
      if (clearBtn) clearBtn.style.display = hasActive ? "inline-flex" : "none";
    } else {
      bar.querySelectorAll(".comp-net-dropdown").forEach((d) => {
        d.style.display = "none";
        d.innerHTML = "";
      });
      if (infoWrap) {
        if (hasActive) {
          const tags = [];
          if (isTypeCustom) {
            const tName =
              this.$g("pf-type-input")?.value ||
              (curType === "known_for" ? "Known For" : curType);
            if (tName) tags.push(tName);
          }
          this.personFilterKeys.forEach((k) => {
            this.getMultiList(k, null, "person").forEach((it) => {
              if (it && it.name) tags.push(it.name);
            });
          });
          infoWrap.innerHTML =
            tags
              .map((t) => `<span class="filter-minimized-tag">${t}</span>`)
              .join("") +
            `<button type="button" class="filter-clear-all-btn" onclick="app.clearPersonFilters()">&times;</button>`;
          infoWrap.style.display = "inline-flex";
        } else {
          infoWrap.innerHTML = "";
          infoWrap.style.display = "none";
        }
      }
      if (clearBtn) clearBtn.style.display = "none";
    }
    bar.classList.toggle("has-active-filters", Boolean(hasActive));
    bar.classList.toggle("minimized", !this.personFilterExpanded);
  },
  clearPersonFilters: function () {
    const tHidden = this.$g("pf-type");
    const tInp = this.$g("pf-type-input");
    const tClr = this.$g("pf-type-clear");
    if (tHidden) tHidden.value = "";
    if (tInp) tInp.value = "";
    if (tClr) tClr.style.display = "none";
    this.updateTypeInputWidth("person");
    if (this.personMulti) {
      this.personFilterKeys.forEach((k) => {
        this.personMulti[k] = [];
      });
    }
    this.personFilterKeys.forEach((k) => {
      const inp = this.$g(`pf-${this.getFieldKey(k)}-input`);
      if (inp) inp.value = "";
    });
    document
      .querySelectorAll("#person-catalog-filter-bar .comp-net-dropdown")
      .forEach((d) => {
        d.style.display = "none";
        d.innerHTML = "";
      });
    this.renderAllFilterTags("person");
    this.applyPersonFilters();
  },
  applyPersonFilters: function () {
    if (!this.personAllCredits) return;
    const typeTab = this.personTypeFilter || "all";
    let list = this.personAllCredits;
    const searchQ = (this.personSearchQuery || "").trim().toLowerCase();
    if (searchQ) {
      list = list.filter((c) =>
        (c.title || c.name || c.original_title || c.original_name || "")
          .toLowerCase()
          .includes(searchQ),
      );
    }
    if (typeTab !== "all") {
      list = list.filter(
        (c) => (c.media_type || (c.title ? "movie" : "tv")) === typeTab,
      );
    }
    const genreList = this.getMultiList("genre", null, "person");
    if (genreList.length > 0) {
      list = list.filter((c) => {
        const gIds = (c.genre_ids || []).map(String);
        const gNames = (c.genres || []).map((g) => String(g.id || g));
        return genreList.every(
          (g) => gIds.includes(String(g.id)) || gNames.includes(String(g.id)),
        );
      });
    }
    const yearList = this.getMultiList("year", null, "person");
    if (yearList.length > 0) {
      const yStrs = yearList.map((y) => String(y.id || y.val || y));
      list = list.filter((c) => {
        const cy = String(c.actingYear || this.getItemYear(c) || "");
        return yStrs.includes(cy);
      });
    }
    const countryList = this.getMultiList("country", null, "person");
    if (countryList.length > 0) {
      const cCodes = countryList.map((c) => String(c.id || c));
      list = list.filter((c) => cCodes.includes(this.getCountryCode(c)));
    }
    const compNetList = this.getMultiList("compNet", null, "person");
    if (compNetList.length > 0) {
      const cnIds = compNetList.map((item) =>
        String(item.id).replace(/^(comp_|net_|prov_)/, ""),
      );
      list = list.filter((c) => {
        const type = c.media_type || (c.title ? "movie" : "tv");
        const meta = this.compNetCache?.[`${type}_${c.id}`];
        if (meta) {
          const allIds = [
            ...(meta.comps || []),
            ...(meta.nets || []),
            ...(meta.provs || []),
          ].map(String);
          if (cnIds.some((id) => allIds.includes(id))) return true;
        }
        const itemComps = (c.production_companies || []).map((p) =>
          String(p.id || p),
        );
        const itemNets = (c.networks || []).map((n) => String(n.id || n));
        return cnIds.some(
          (id) => itemComps.includes(id) || itemNets.includes(id),
        );
      });
    }
    const sOrder = this.personYearSort || "desc";
    const sortType = this.$g("pf-type")?.value;
    if (sortType === "known_for") {
      list = this.filterPersonKnownFor(list, sOrder);
    } else {
      list = [...list].sort((a, b) => {
        const yA = a.actingYear || "";
        const yB = b.actingYear || "";
        if (!yA && !yB) return 0;
        if (!yA) return 1;
        if (!yB) return -1;
        return sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      });
    }
    this.personFilteredCredits = list;
    const countHeading = this.$g("person-titles-heading");
    const actions = this.$g("person-header-actions");
    if (countHeading) {
      const count = list.length;
      if (typeTab === "movie") countHeading.textContent = `${count} Movies`;
      else if (typeTab === "tv") countHeading.textContent = `${count} Shows`;
      else countHeading.textContent = `${count} Titles`;
      countHeading.style.display = "block";
    }
    if (actions) actions.style.display = "flex";
    const grid = this.$g("person-filmography-grid");
    if (grid) {
      const initialBatch = list.slice(0, 30);
      this.personRenderedCount = initialBatch.length;
      if (initialBatch.length === 0) {
        grid.innerHTML =
          '<div class="msg-box">No ' +
          (typeTab === "movie"
            ? "movies"
            : typeTab === "tv"
              ? "shows"
              : "titles") +
          " found.</div>";
      } else {
        grid.innerHTML = initialBatch
          .map((c) => {
            const type = c.media_type || (c.title ? "movie" : "tv");
            return this.buildCard(c, type);
          })
          .join("");
        this.markImgsLoaded(grid.querySelectorAll("img"));
        this.bindPersonTvCardClicks();
      }
    }
    this.updatePersonFilterToggleUI();
  },
  toggleSourceFilterBar: function (forceState = null) {
    const bar = this.$g("source-catalog-filter-bar");
    const prevHeight = bar ? bar.offsetHeight : 0;
    this.sourceFilterExpanded =
      forceState !== null ? forceState : !this.sourceFilterExpanded;
    const boxesWrap =
      this.$g("sf-boxes-wrap") ||
      bar?.querySelector(".explore-filter-boxes-wrap");
    if (this.sourceFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-up");
      boxesWrap.classList.add("slide-down");
    } else if (!this.sourceFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-down");
      boxesWrap.classList.add("slide-up");
    }
    this.updateSourceFilterToggleUI();
    if (bar && prevHeight) {
      const newHeight = bar.offsetHeight;
      if (prevHeight !== newHeight) {
        bar.style.height = prevHeight + "px";
        bar.getBoundingClientRect();
        bar.classList.add("animating");
        bar.style.height = newHeight + "px";
        const onEnd = (e) => {
          if (e.target !== bar || e.propertyName !== "height") return;
          bar.removeEventListener("transitionend", onEnd);
          bar.classList.remove("animating");
          bar.style.height = "";
          if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
        };
        bar.addEventListener("transitionend", onEnd);
        setTimeout(() => {
          if (bar.classList.contains("animating")) {
            bar.classList.remove("animating");
            bar.style.height = "";
            if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
          }
        }, 320);
      }
    }
  },
  updateSourceFilterToggleUI: function () {
    const toggleBtn = this.$g("btn-source-filter-toggle");
    const bar = this.$g("source-catalog-filter-bar");
    const infoWrap = this.$g("source-filter-minimized-info");
    const clearBtn = this.$g("sf-clear-all-btn");
    if (!toggleBtn || !bar) return;
    const curType = this.$g("sf-type")?.value;
    const isTypeCustom = Boolean(curType);
    const hasMulti = this.sourceFilterKeys.some(
      (k) => this.getMultiList(k, null, "source").length > 0,
    );
    const hasActive = isTypeCustom || hasMulti;
    toggleBtn.classList.toggle("active", Boolean(this.sourceFilterExpanded));
    if (this.sourceFilterExpanded) {
      if (infoWrap) {
        infoWrap.innerHTML = "";
        infoWrap.style.display = "none";
      }
      if (clearBtn) clearBtn.style.display = hasActive ? "inline-flex" : "none";
    } else {
      bar.querySelectorAll(".comp-net-dropdown").forEach((d) => {
        d.style.display = "none";
        d.innerHTML = "";
      });
      if (infoWrap) {
        if (hasActive) {
          const tags = [];
          if (isTypeCustom) {
            const tName = this.$g("sf-type-input")?.value || curType;
            if (tName) tags.push(tName);
          }
          this.sourceFilterKeys.forEach((k) => {
            this.getMultiList(k, null, "source").forEach((it) => {
              if (it && it.name) tags.push(it.name);
            });
          });
          infoWrap.innerHTML =
            tags
              .map((t) => `<span class="filter-minimized-tag">${t}</span>`)
              .join("") +
            `<button type="button" class="filter-clear-all-btn" onclick="app.clearSourceFilters()">&times;</button>`;
          infoWrap.style.display = "inline-flex";
        } else {
          infoWrap.innerHTML = "";
          infoWrap.style.display = "none";
        }
      }
      if (clearBtn) clearBtn.style.display = "none";
    }
    bar.classList.toggle("has-active-filters", Boolean(hasActive));
    bar.classList.toggle("minimized", !this.sourceFilterExpanded);
  },
  clearSourceFilters: function () {
    const tHidden = this.$g("sf-type");
    const tInp = this.$g("sf-type-input");
    const tClr = this.$g("sf-type-clear");
    if (tHidden) tHidden.value = "";
    if (tInp) tInp.value = "";
    if (tClr) tClr.style.display = "none";
    this.updateTypeInputWidth("source");
    if (this.sourceMulti) {
      this.sourceFilterKeys.forEach((k) => {
        this.sourceMulti[k] = [];
      });
    }
    this.sourceFilterKeys.forEach((k) => {
      const inp = this.$g(`sf-${this.getFieldKey(k)}-input`);
      if (inp) inp.value = "";
    });
    document
      .querySelectorAll("#source-catalog-filter-bar .comp-net-dropdown")
      .forEach((d) => {
        d.style.display = "none";
        d.innerHTML = "";
      });
    this.renderAllFilterTags("source");
    this.applySourceFilters();
  },
  applySourceFilters: async function () {
    if (!this.sourceAllTitles) return;
    const typeTab = this.sourceTypeFilter || "all";
    let list = this.sourceAllTitles;
    const searchQ = (this.sourceSearchQuery || "").trim().toLowerCase();
    if (searchQ) {
      list = list.filter((item) =>
        (
          item.title ||
          item.name ||
          item.original_title ||
          item.original_name ||
          ""
        )
          .toLowerCase()
          .includes(searchQ),
      );
    }
    if (typeTab !== "all") {
      list = list.filter(
        (item) =>
          (item.media_type || (item.title ? "movie" : "tv")) === typeTab,
      );
    }
    const genreList = this.getMultiList("genre", null, "source");
    if (genreList.length > 0) {
      list = list.filter((item) => {
        const gIds = (item.genre_ids || []).map(String);
        const gNames = (item.genres || []).map((g) => String(g.id || g));
        return genreList.every(
          (g) => gIds.includes(String(g.id)) || gNames.includes(String(g.id)),
        );
      });
    }
    const yearList = this.getMultiList("year", null, "source");
    if (yearList.length > 0) {
      const yStrs = yearList.map((y) => String(y.id || y.val || y));
      list = list.filter((item) => {
        const y = String(this.getItemYear(item) || "");
        return yStrs.includes(y);
      });
    }
    const countryList = this.getMultiList("country", null, "source");
    if (countryList.length > 0) {
      const cCodes = countryList.map((c) => String(c.id || c));
      list = list.filter((item) => cCodes.includes(this.getCountryCode(item)));
    }
    const personList = this.getMultiList("person", null, "source");
    if (personList.length > 0) {
      const pCreditsSets = await Promise.all(
        personList.map(async (p) => {
          try {
            const key = this.getTmdbAnimeKey();
            const [mCred, tCred] = await Promise.all([
              this.api(`/person/${p.id}/movie_credits`, {}, key).catch(
                () => null,
              ),
              this.api(`/person/${p.id}/tv_credits`, {}, key).catch(() => null),
            ]);
            const pIds = new Set();
            (mCred?.cast || []).forEach((c) => {
              if (c?.id) pIds.add(String(c.id));
            });
            (mCred?.crew || []).forEach((c) => {
              if (c?.id) pIds.add(String(c.id));
            });
            (tCred?.cast || []).forEach((c) => {
              if (c?.id) pIds.add(String(c.id));
            });
            (tCred?.crew || []).forEach((c) => {
              if (c?.id) pIds.add(String(c.id));
            });
            return pIds;
          } catch (e) {
            return new Set();
          }
        }),
      );
      list = list.filter((item) =>
        pCreditsSets.every((pSet) => pSet.has(String(item.id))),
      );
    }
    const sOrder = this.sourceYearSort || "desc";
    const sortType = this.$g("sf-type")?.value;
    if (sortType === "trending") {
      list = [...list].sort((a, b) => {
        const scoreA = (a.popularity || 0) + (a.vote_count || 0) * 0.1;
        const scoreB = (b.popularity || 0) + (b.vote_count || 0) * 0.1;
        const diff = scoreB - scoreA;
        if (diff !== 0) return sOrder === "asc" ? -diff : diff;
        const yA = this.getItemYear(a) || "";
        const yB = this.getItemYear(b) || "";
        return sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      });
    } else if (sortType === "newest") {
      list = [...list].sort((a, b) => {
        const yA = this.getItemYear(a) || "";
        const yB = this.getItemYear(b) || "";
        if (!yA && !yB) return 0;
        if (!yA) return 1;
        if (!yB) return -1;
        return sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      });
    } else if (sortType === "top_rated") {
      list = [...list].sort((a, b) => {
        const diff = (b.vote_average || 0) - (a.vote_average || 0);
        if (diff !== 0) return sOrder === "asc" ? -diff : diff;
        const vDiff = (b.vote_count || 0) - (a.vote_count || 0);
        if (vDiff !== 0) return sOrder === "asc" ? -vDiff : vDiff;
        const yA = this.getItemYear(a) || "";
        const yB = this.getItemYear(b) || "";
        return sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      });
    } else {
      list = [...list].sort((a, b) => {
        const yA = this.getItemYear(a) || "";
        const yB = this.getItemYear(b) || "";
        if (!yA && !yB) return 0;
        if (!yA) return 1;
        if (!yB) return -1;
        return sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      });
    }
    this.sourceFilteredTitles = list;
    const countHeading = this.$g("source-titles-heading");
    if (countHeading) {
      const count = list.length;
      const hasFilterActive =
        this.sourceFilterKeys.some(
          (k) => this.getMultiList(k, null, "source").length > 0,
        ) ||
        Boolean(this.$g("sf-type")?.value) ||
        Boolean((this.sourceSearchQuery || "").trim());
      if (typeTab === "movie") {
        countHeading.textContent =
          (hasFilterActive ? count : this.sourceMovieTotalResults || count) +
          " Movies";
      } else if (typeTab === "tv") {
        countHeading.textContent =
          (hasFilterActive ? count : this.sourceTvTotalResults || count) +
          " Shows";
      } else {
        countHeading.textContent =
          (hasFilterActive ? count : this.sourceTotalResults || count) +
          " Titles";
      }
    }
    const grid = this.$g("source-titles-grid");
    if (grid) {
      const initialBatch = list.slice(0, 30);
      this.sourceRenderedCount = initialBatch.length;
      if (initialBatch.length === 0) {
        grid.innerHTML =
          '<div class="msg-box">No ' +
          (typeTab === "movie"
            ? "movies"
            : typeTab === "tv"
              ? "shows"
              : "titles") +
          " found.</div>";
      } else {
        grid.innerHTML = initialBatch
          .map((item) => {
            const type = item.media_type || (item.title ? "movie" : "tv");
            return this.buildCard(item, type);
          })
          .join("");
        this.markImgsLoaded(grid.querySelectorAll("img"));
      }
    }
    this.updateSourceFilterToggleUI();
  },
  syncTogglePair: function (pfx, val, opt1, opt2) {
    const b1 = this.$g(`${pfx}-${opt1}-btn`),
      b2 = this.$g(`${pfx}-${opt2}-btn`);
    if (b1) b1.classList.toggle("active", val === opt1);
    if (b2) b2.classList.toggle("active", val === opt2);
  },
  syncYearSortBtns: function (prefix, order) {
    this.syncTogglePair(prefix, order, "desc", "asc");
  },
  setYearSort: function (order) {
    this.yearSortOrder = this.yearSortOrder === order ? null : order;
    this.syncYearSortBtns("year-sort", this.yearSortOrder);
    this.resetExplore();
  },
  updateYearSortVisibility: function () {
    const wrap = this.$g("year-sort-wrap");
    if (!wrap) return;
    const t = this.exploreType;
    if (t === "person" || t === "company") {
      wrap.style.display = "none";
      const grp = this.$g("filter-year-group");
      if (grp) grp.classList.remove("has-year-sort");
      this.yearSortOrder = null;
      return;
    }
    const years = this.getMultiList("year", t);
    const curType = this.$g("filter-type")?.value || "all";
    const hasAnime = this.getMultiList("genre", t).some(
      (item) => item.id === "anime",
    );
    const isTypeTrigger =
      (t === "movie" &&
        (curType === "revenue" ||
          curType === "top_rated" ||
          (hasAnime && curType === "popular"))) ||
      (t === "tv" &&
        (curType === "top_rated" ||
          (hasAnime && (curType === "popular" || curType === "specials"))));
    const hasGenreFilter = this.getMultiList("genre", t).some(
      (item) => item.id !== "anime",
    );
    const hasFilter =
      hasGenreFilter ||
      [
        "genre2",
        "season",
        "compNet",
        "country",
        "person",
        "aniStudio",
        "aniStaff",
        "aniTag",
      ].some((k) => this.getMultiList(k, t).length > 0) ||
      years.length > 1 ||
      isTypeTrigger;
    const isAllOrMultiYears = years.length === 0 || years.length > 1;
    const shouldShow = hasFilter && isAllOrMultiYears;
    wrap.style.display = shouldShow ? "inline-flex" : "none";
    const grp = this.$g("filter-year-group");
    if (grp) grp.classList.toggle("has-year-sort", shouldShow);
    if (!shouldShow) this.yearSortOrder = null;
    this.syncYearSortBtns("year-sort", this.yearSortOrder);
  },
  personRoleFilter: null,
  setRoleFilter: function (kind, role) {
    const isStaff = kind === "ani-staff";
    const prop = isStaff ? "aniStaffRoleFilter" : "personRoleFilter";
    const pfx = isStaff ? "ani-staff-role" : "person-role";
    this[prop] = this[prop] === role ? null : role;
    this.syncPersonRoleBtns(pfx, this[prop]);
    this.saveExplorePrefs();
    this.resetExplore();
  },
  setPersonRole: function (role) {
    this.setRoleFilter("person", role);
  },
  syncPersonRoleBtns: function (pfx, role) {
    this.syncTogglePair(pfx, role, "main", "other");
  },
  updatePersonRoleVisibility: function () {
    const t = this.exploreType;
    const personList = this.getMultiList("person", t);
    const pWrap = this.$g("person-role-wrap");
    const pGrp = this.$g("filter-person-group");
    if (pWrap && pGrp) {
      const isSingleActor =
        personList.length === 1 &&
        (!personList[0].dept || personList[0].dept === "Acting");
      pWrap.style.display = isSingleActor ? "inline-flex" : "none";
      pGrp.classList.toggle("has-role-filter", isSingleActor);
      if (!isSingleActor) this.personRoleFilter = null;
      this.syncPersonRoleBtns("person-role", this.personRoleFilter);
    }
    const aniStaffList = this.getMultiList("aniStaff", t);
    const sWrap = this.$g("ani-staff-role-wrap");
    const sGrp = this.$g("filter-ani-staff-group");
    if (sWrap && sGrp) {
      const isSingleVoiceActor =
        aniStaffList.length === 1 &&
        (!aniStaffList[0].dept ||
          aniStaffList[0].dept === "Voice Actor" ||
          aniStaffList[0].dept === "Acting" ||
          aniStaffList[0].dept === "Voice Actress");
      sWrap.style.display = isSingleVoiceActor ? "inline-flex" : "none";
      sGrp.classList.toggle("has-role-filter", isSingleVoiceActor);
      if (!isSingleVoiceActor) this.aniStaffRoleFilter = null;
      this.syncPersonRoleBtns("ani-staff-role", this.aniStaffRoleFilter);
    }
  },
  saveExplorePrefs: function () {
    const t = this.exploreType;
    if (!this.explorePrefs) this.explorePrefs = { movie: {}, tv: {} };
    if (!this.explorePrefs[t]) this.explorePrefs[t] = {};
    this.explorePrefs[t].type = this.$g("filter-type")?.value || "all";
    this.explorePrefs[t].typeName = this.$g("filter-type-input")?.value || "";
    this.explorePrefs[t].personRole = this.personRoleFilter;
    this.explorePrefs[t].aniStaffRole = this.aniStaffRoleFilter;
    this.filterKeys.forEach((k) => {
      this.explorePrefs[t][k] = this.getMultiList(k, t);
    });
    this.$storeSet("explorePrefs", this.explorePrefs);
    this.updateFilterClearBtn();
    this.updateYearSortVisibility();
    this.updatePersonRoleVisibility();
  },
  updateFilterClearBtn: function () {
    const btn = this.$g("filter-clear-all-btn");
    const isTypeCustom = (this.$g("filter-type")?.value || "all") !== "all";
    const hasMulti = this.filterKeys.some((k) => {
      const list = this.getMultiList(k);
      return k === "genre"
        ? list.some((item) => item.id !== "anime")
        : list.length > 0;
    });
    const hasActive = isTypeCustom || hasMulti;
    if (btn) btn.style.display = hasActive ? "inline-flex" : "none";
    this.updateExploreFilterToggleUI();
  },
  toggleExploreFilterBar: function (forceState = null) {
    const bar = this.$g("explore-filter-bar");
    const prevHeight = bar ? bar.offsetHeight : 0;
    this.exploreFilterExpanded =
      forceState !== null ? forceState : !this.exploreFilterExpanded;
    const boxesWrap = this.$g("explore-filter-boxes-wrap");
    if (this.exploreFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-up");
      boxesWrap.classList.add("slide-down");
    } else if (!this.exploreFilterExpanded && boxesWrap) {
      boxesWrap.classList.remove("slide-down");
      boxesWrap.classList.add("slide-up");
    }
    this.updateExploreFilterToggleUI();
    if (bar && prevHeight) {
      const newHeight = bar.offsetHeight;
      if (prevHeight !== newHeight) {
        bar.style.height = prevHeight + "px";
        bar.getBoundingClientRect();
        bar.classList.add("animating");
        bar.style.height = newHeight + "px";
        const onEnd = (e) => {
          if (e.target !== bar || e.propertyName !== "height") return;
          bar.removeEventListener("transitionend", onEnd);
          bar.classList.remove("animating");
          bar.style.height = "";
          if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
        };
        bar.addEventListener("transitionend", onEnd);
        setTimeout(() => {
          if (bar.classList.contains("animating")) {
            bar.classList.remove("animating");
            bar.style.height = "";
            if (boxesWrap) boxesWrap.classList.remove("slide-down", "slide-up");
          }
        }, 320);
      }
    }
  },
  updateExploreFilterToggleUI: function () {
    const toggleBtn = this.$g("btn-filter-toggle");
    const bar = this.$g("explore-filter-bar");
    const infoWrap = this.$g("filter-minimized-info");
    const clearBtn = this.$g("filter-clear-all-btn");
    if (!toggleBtn || !bar) return;
    const isTypeCustom = (this.$g("filter-type")?.value || "all") !== "all";
    const hasMulti = this.filterKeys.some((k) => {
      const list = this.getMultiList(k);
      return k === "genre"
        ? list.some((item) => item.id !== "anime")
        : list.length > 0;
    });
    const hasActive = isTypeCustom || hasMulti;
    toggleBtn.classList.toggle("active", Boolean(this.exploreFilterExpanded));
    const isEntity =
      this.exploreType === "person" || this.exploreType === "company";
    const expRoleInp = this.$g("filter-exp-role-input");
    if (expRoleInp && isEntity)
      expRoleInp.placeholder =
        this.exploreType === "person" ? "Department" : "Type";
    const aniBtn = this.$g("btn-explore-anime");
    const randBtn = this.$g("btn-explore-random");
    if (aniBtn) aniBtn.style.display = isEntity ? "none" : "";
    if (randBtn) randBtn.style.display = isEntity ? "none" : "";
    const selectors = bar.querySelectorAll(
      ".comp-net-wrap, .filter-year-group, .filter-person-group, .filter-ani-staff-group",
    );
    if (this.exploreFilterExpanded) {
      selectors.forEach((el) => {
        if (isEntity) {
          const showEntityBox =
            el.id === "filter-type-wrap" ||
            el.id === "filter-exp-role-wrap" ||
            el.id === "filter-country-wrap";
          el.style.display = showEntityBox ? "inline-flex" : "none";
          return;
        }
        if (el.id === "filter-exp-role-wrap") {
          el.style.display = "none";
          return;
        }
        if (
          el.id === "filter-person-wrap" ||
          el.id === "filter-ani-staff-wrap"
        ) {
          el.style.display = "inline-flex";
          return;
        }
        if (el.id === "filter-genre-wrap") {
          const hasAnime = this.getMultiList("genre").some(
            (item) => item.id === "anime",
          );
          el.style.display = !hasAnime ? "inline-flex" : "none";
        } else if (
          el.id === "filter-genre2-wrap" ||
          el.id === "filter-ani-tag-wrap" ||
          el.id === "filter-season-wrap" ||
          el.id === "filter-ani-studio-wrap" ||
          el.id === "filter-ani-staff-group"
        ) {
          const hasAnime = this.getMultiList("genre").some(
            (item) => item.id === "anime",
          );
          el.style.display = hasAnime ? "inline-flex" : "none";
        } else if (
          el.id === "filter-comp-net-wrap" ||
          el.id === "filter-person-group"
        ) {
          const hasAnime = this.getMultiList("genre").some(
            (item) => item.id === "anime",
          );
          el.style.display = !hasAnime ? "inline-flex" : "none";
        } else {
          el.style.display = "inline-flex";
        }
      });
      if (infoWrap) {
        infoWrap.innerHTML = "";
        infoWrap.style.display = "none";
      }
      if (clearBtn)
        clearBtn.style.display =
          hasActive && this.exploreFilterExpanded ? "inline-flex" : "none";
    } else {
      selectors.forEach((el) => {
        el.style.display = "none";
      });
      if (infoWrap) {
        if (hasActive) {
          const tags = [];
          if (isTypeCustom) {
            const tName =
              this.$g("filter-type-input")?.value ||
              this.$g("filter-type")?.value;
            if (tName) tags.push(tName);
          }
          this.filterKeys.forEach((k) => {
            this.getMultiList(k).forEach((it) => {
              if (it && it.name) {
                if (k === "genre" && it.id === "anime") return;
                if (k === "person" && this.personRoleFilter) {
                  tags.push(
                    `${it.name} (${this.personRoleFilter === "main" ? "Main" : "Other"})`,
                  );
                } else if (k === "aniStaff" && this.aniStaffRoleFilter) {
                  tags.push(
                    `${it.name} (${this.aniStaffRoleFilter === "main" ? "Main" : "Other"})`,
                  );
                } else {
                  tags.push(it.name);
                }
              }
            });
          });
          infoWrap.innerHTML =
            tags
              .map((t) => `<span class="filter-minimized-tag">${t}</span>`)
              .join("") +
            `<button type="button" class="filter-clear-all-btn" id="filter-clear-all-btn-min" onclick="app.clearAllFilters()">&times;</button>`;
          infoWrap.style.display = "inline-flex";
        } else {
          infoWrap.innerHTML = "";
          infoWrap.style.display = "none";
        }
      }
      if (clearBtn)
        clearBtn.style.display =
          hasActive && this.exploreFilterExpanded ? "inline-flex" : "none";
    }
    bar.classList.toggle("has-active-filters", Boolean(hasActive));
    bar.classList.toggle("minimized", !this.exploreFilterExpanded);
    this.updateExploreEntitySearchUI();
    this.updateAnimeBtnUI();
    this.updateRandomBtnUI();
    this.updateYearSortVisibility();
    this.updatePersonRoleVisibility();
  },
  clearAllFilters: function () {
    this.yearSortOrder = null;
    this.personRoleFilter = null;
    this.aniStaffRoleFilter = null;
    const tId = this.$g("filter-type"),
      tInp = this.$g("filter-type-input"),
      tClr = this.$g("filter-type-clear");
    if (tId) tId.value = "all";
    if (tInp) tInp.value = "";
    if (tClr) tClr.style.display = "none";
    this.updateTypeInputWidth();
    const t = this.exploreType;
    if (this.exploreMulti && this.exploreMulti[t]) {
      this.filterKeys.forEach((k) => {
        this.exploreMulti[t][k] = [];
      });
    }
    this.filterKeys.forEach((k) => {
      const inp = this.$g(`filter-${this.getFieldKey(k)}-input`);
      if (inp) inp.value = "";
    });
    document
      .querySelectorAll("#view-explore .comp-net-dropdown")
      .forEach((d) => {
        d.style.display = "none";
        d.innerHTML = "";
      });
    this.renderAllFilterTags();
    this.saveExplorePrefs();
    this.updateYearSortVisibility();
    this.updatePersonRoleVisibility();
    this.resetExplore(true);
  },
  resetExplore: function (forceClear = false) {
    this.exploreLoading = false;
    this.exploreHasMore = true;
    this.explorePage = 1;
    this._personExploreRawPage = 0;
    this.exploreSeenIds = new Set();
    this.exploreSeenTitles = new Set();
    this.exploreRandomPool = [];
    this.exploreRandomAniPool = [];
    this.exploreRandomPersonList = null;
    this.exploreReqId = (this.exploreReqId || 0) + 1;
    if (forceClear && this.exploreScrollPos)
      this.exploreScrollPos[this.exploreType] = 0;
    this.initExploreMulti();
    const tId = this.$g("filter-type"),
      tInp = this.$g("filter-type-input"),
      tClr = this.$g("filter-type-clear");
    if (forceClear || this.lastExploreType !== this.exploreType) {
      this.lastActiveAnime = false;
      this.yearSortOrder = null;
      this.personRoleFilter = null;
      this.aniStaffRoleFilter = null;
      const p =
        this.explorePrefs && this.explorePrefs[this.exploreType]
          ? this.explorePrefs[this.exploreType]
          : {};
      this.personRoleFilter = p.personRole || null;
      this.aniStaffRoleFilter = p.aniStaffRole || null;
      let curType = p.type || "all";
      const typeOpts = this.getTypeOptions("explore");
      if (
        (curType === "specials" ||
          curType === "top_rated" ||
          curType === "revenue") &&
        !typeOpts.some((o) => o.val === curType)
      ) {
        curType = "all";
        if (p) p.type = "all";
      }
      if (tId) tId.value = curType;
      const tMatch = typeOpts.find((o) => o.val === curType);
      if (tInp)
        tInp.value =
          curType && curType !== "all"
            ? tMatch
              ? tMatch.name
              : p.typeName || ""
            : "";
      if (tClr)
        tClr.style.display =
          curType && curType !== "all" ? "inline-flex" : "none";
      this.updateTypeInputWidth();
      this.lastExploreType = this.exploreType;
    } else {
      this.saveExplorePrefs();
    }
    this.updateTypeInputWidth();
    this.renderAllFilterTags();
    this.updateFilterClearBtn();
    this.updateYearSortVisibility();
    this.updatePersonRoleVisibility();
    this.$g("explore-grid").innerHTML = "";
    this.loadExplore();
  },
  appendExploreGridHtml(grid, html, isReplace) {
    if (!grid) return;
    if (isReplace) {
      grid.innerHTML = html;
      return;
    }
    const bLoader = grid.querySelector(".dots-loader");
    if (bLoader && bLoader.parentNode === grid) {
      bLoader.insertAdjacentHTML("beforebegin", html);
      bLoader.remove();
    } else {
      grid.insertAdjacentHTML("beforeend", html);
    }
  },
  async runExploreBatched(items, concurrency, currentReqId, workerFn) {
    const out = [];
    for (let i = 0; i < items.length; i += concurrency) {
      if (currentReqId !== this.exploreReqId) return null;
      const batch = items.slice(i, i + concurrency);
      const res = await Promise.all(batch.map(workerFn));
      if (currentReqId !== this.exploreReqId) return null;
      out.push(...res);
    }
    return out;
  },
  async enrichExplorePersonCountry(p) {
    if (!p || !p.id) return "";
    if (!this._personCountryCache) this._personCountryCache = {};
    const pid = String(p.id);
    if (this._personCountryCache[pid] !== undefined) {
      p._country = this._personCountryCache[pid];
      return p._country;
    }
    try {
      const det = await this.api("/person/" + pid, {}, this.getTmdbAnimeKey());
      const code = this.extractCountryCodeFromBirthplace(
        det && det.place_of_birth,
      );
      this._personCountryCache[pid] = code;
      p._country = code;
      if (code) {
        document.querySelectorAll(".badge-person-ctry-" + pid).forEach((el) => {
          el.innerHTML =
            '<span class="card-meta-dot">&bull;</span><span>' +
            code +
            "</span>";
          el.style.display = "inline";
        });
        document
          .querySelectorAll(".badge-person-ov-ctry-" + pid)
          .forEach((el) => {
            el.innerHTML = " &bull; " + code;
            el.style.display = "inline";
          });
      }
      return code;
    } catch (e) {
      this._personCountryCache[pid] = "";
      return "";
    }
  },
  async enrichPeopleCountriesQueue(peopleList, currentReqId) {
    const pending = (peopleList || []).filter(
      (p) => p && p._country === undefined,
    );
    for (let i = 0; i < pending.length; i += 4) {
      if (currentReqId !== this.exploreReqId || this.currentView !== "people")
        return;
      await Promise.all(
        pending.slice(i, i + 4).map((p) => this.enrichExplorePersonCountry(p)),
      );
    }
  },
  async loadExplorePeople(currentReqId, grid) {
    let bottomLoader = null;
    try {
      const sortType = this.$g("filter-type")?.value || "all";
      const roles = this.getMultiList("exp-role", "person", "explore").map(
        (r) => r.id,
      );
      const countries = this.getMultiList("country", "person", "explore").map(
        (c) => c.id,
      );
      const pg = this.explorePage;
      const cacheKey =
        sortType +
        "|" +
        roles.slice().sort().join(",") +
        "|" +
        countries.slice().sort().join(",") +
        "|" +
        pg;
      if (!this._explorePeopleCache) this._explorePeopleCache = {};
      if (this._explorePeopleCache[cacheKey]) {
        const cachedList = this._explorePeopleCache[cacheKey].filter(
          (p) => !this.exploreSeenIds.has(String(p.id)),
        );
        cachedList.forEach((p) => {
          this.exploreSeenIds.add(String(p.id));
          if (
            this._personCountryCache &&
            this._personCountryCache[String(p.id)] !== undefined
          ) {
            p._country = this._personCountryCache[String(p.id)];
          }
        });
        this.exploreLoading = false;
        if (cachedList.length > 0) {
          const html = cachedList
            .map((p) => this.buildPersonExploreCard(p))
            .join("");
          if (pg === 1 || !grid.querySelector(".poster-card"))
            grid.innerHTML = html;
          else grid.insertAdjacentHTML("beforeend", html);
          this.markImgsLoaded(grid.querySelectorAll("img"));
          if (countries.length === 0)
            this.enrichPeopleCountriesQueue(cachedList, currentReqId);
        } else if (pg === 1 && !grid.querySelector(".poster-card")) {
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
        }
        this.stopLoader();
        return;
      }
      if (pg === 1) {
        grid.innerHTML = DOTS_HTML;
      } else {
        const oldL = grid.querySelector(".dots-loader");
        if (oldL) oldL.remove();
        bottomLoader = document.createElement("div");
        bottomLoader.className = "dots-loader";
        bottomLoader.style.gridColumn = "1 / -1";
        bottomLoader.style.minHeight = "0";
        bottomLoader.style.padding = "16px 0 28px";
        bottomLoader.innerHTML =
          '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        grid.appendChild(bottomLoader);
      }
      const key = this.getTmdbAnimeKey();
      const ep =
        sortType === "trending" ? "/trending/person/week" : "/person/popular";
      const collected = [];
      const candidates = [];
      const needsCreditSeeding =
        countries.length > 0 || roles.some((r) => r !== "Acting");
      if (needsCreditSeeding) {
        const cParam =
          countries.length > 0
            ? {
                with_origin_country: countries
                  .map((c) => (c === "UK" ? "GB" : c))
                  .join("|"),
              }
            : {};
        const discSort =
          sortType === "trending"
            ? "popularity.desc"
            : pg % 2 === 1
              ? "popularity.desc"
              : "vote_count.desc";
        const [dm, dt] = await Promise.all([
          this.api(
            "/discover/movie",
            { sort_by: discSort, page: pg, ...cParam },
            key,
          ).catch(() => ({ results: [] })),
          this.api(
            "/discover/tv",
            { sort_by: discSort, page: pg, ...cParam },
            key,
          ).catch(() => ({ results: [] })),
        ]);
        if (currentReqId !== this.exploreReqId) return;
        const credTargets = [
          ...(dm.results || [])
            .slice(0, 8)
            .map((m) => ({ ep: "/movie/" + m.id + "/credits" })),
          ...(dt.results || [])
            .slice(0, 5)
            .map((s) => ({ ep: "/tv/" + s.id + "/credits" })),
        ];
        const creds = await this.runExploreBatched(
          credTargets,
          5,
          currentReqId,
          (t) => this.api(t.ep, {}, key).catch(() => null),
        );
        if (!creds || currentReqId !== this.exploreReqId) return;
        const seenCand = new Set();
        creds.forEach((cr) => {
          if (!cr) return;
          const crewList = (cr.crew || []).map((w) => {
            let dpt = w.department || w.known_for_department || "";
            if (w.job === "Director") dpt = "Directing";
            else if (/writer|screenplay|story/i.test(w.job || ""))
              dpt = "Writing";
            else if (/producer/i.test(w.job || "")) dpt = "Production";
            return {
              ...w,
              known_for_department:
                dpt || w.known_for_department || "Production",
            };
          });
          const combined = roles.some((r) => r !== "Acting")
            ? [...crewList, ...(cr.cast || []).slice(0, 6)]
            : [...(cr.cast || []).slice(0, 8), ...crewList];
          combined.forEach((p) => {
            if (
              p &&
              p.id &&
              p.profile_path &&
              !p.adult &&
              !seenCand.has(p.id)
            ) {
              seenCand.add(p.id);
              candidates.push(p);
            }
          });
        });
      }
      let scans = 0;
      const maxScans = roles.length > 0 || countries.length > 0 ? 2 : 1;
      const mixRegional =
        pg >= 2 &&
        countries.length === 0 &&
        (roles.length === 0 || roles.includes("Acting"));
      const fetchRegionalMix = async () => {
        if (!mixRegional) return { kr: [], jp: [] };
        try {
          const discPg = Math.ceil((pg - 1) / 3);
          const slot = ((pg - 2) % 3) * 2;
          const [krTv, krMov, jpAni] = await Promise.all([
            this.api(
              "/discover/tv",
              {
                with_origin_country: "KR",
                sort_by: "popularity.desc",
                page: discPg,
              },
              key,
            ).catch(() => ({ results: [] })),
            this.api(
              "/discover/movie",
              {
                with_origin_country: "KR",
                sort_by: "popularity.desc",
                page: discPg,
              },
              key,
            ).catch(() => ({ results: [] })),
            this.api(
              "/discover/tv",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: "popularity.desc",
                page: discPg,
              },
              key,
            ).catch(() => ({ results: [] })),
          ]);
          if (currentReqId !== this.exploreReqId) return { kr: [], jp: [] };
          const krTargets = [];
          if (krTv?.results?.[slot]?.id)
            krTargets.push(
              "/tv/" + krTv.results[slot].id + "/aggregate_credits",
            );
          if (krMov?.results?.[slot]?.id)
            krTargets.push("/movie/" + krMov.results[slot].id + "/credits");
          const jpTargets = [];
          if (jpAni?.results?.[slot]?.id)
            jpTargets.push(
              "/tv/" + jpAni.results[slot].id + "/aggregate_credits",
            );
          if (jpAni?.results?.[slot + 1]?.id)
            jpTargets.push(
              "/tv/" + jpAni.results[slot + 1].id + "/aggregate_credits",
            );
          const [krCreds, jpCreds] = await Promise.all([
            Promise.all(
              krTargets.map((u) => this.api(u, {}, key).catch(() => null)),
            ),
            Promise.all(
              jpTargets.map((u) => this.api(u, {}, key).catch(() => null)),
            ),
          ]);
          const pickActors = (credsList, ctryCode, limit) => {
            const out = [];
            const localSeen = new Set();
            for (const cr of credsList || []) {
              for (const p of cr?.cast || []) {
                if (!p || !p.id || !p.profile_path || p.adult) continue;
                const pid = String(p.id);
                if (this.exploreSeenIds.has(pid) || localSeen.has(pid))
                  continue;
                localSeen.add(pid);
                out.push({
                  ...p,
                  known_for_department: p.known_for_department || "Acting",
                  _country: ctryCode,
                });
                if (out.length >= limit) return out;
              }
            }
            return out;
          };
          return {
            kr: pickActors(krCreds, "KR", 4),
            jp: pickActors(jpCreds, "JP", 4),
          };
        } catch (e) {
          return { kr: [], jp: [] };
        }
      };
      while (collected.length < 20 && scans < maxScans) {
        scans++;
        this._personExploreRawPage = (this._personExploreRawPage || 0) + 1;
        const [res, regMix] = await Promise.all([
          this.api(ep, { page: this._personExploreRawPage }, key).catch(
            () => null,
          ),
          scans === 1 && mixRegional
            ? fetchRegionalMix()
            : Promise.resolve({ kr: [], jp: [] }),
        ]);
        if (currentReqId !== this.exploreReqId) return;
        const rawList = (res && res.results) || [];
        const basePool =
          scans === 1 && candidates.length > 0
            ? [...candidates, ...rawList]
            : rawList;
        const pool =
          scans === 1 && (regMix.kr.length > 0 || regMix.jp.length > 0)
            ? this.zipInterleave([basePool, regMix.kr, regMix.jp])
            : basePool;
        const filtered = pool.filter((p) => {
          if (!p || !p.id || !p.profile_path || p.adult) return false;
          const pid = String(p.id);
          if (this.exploreSeenIds.has(pid)) return false;
          if (
            roles.length > 0 &&
            !roles.includes(p.known_for_department || "Acting")
          )
            return false;
          return true;
        });
        if (countries.length > 0) {
          const uniqueBatch = [];
          const seenBatch = new Set();
          for (let i = 0; i < filtered.length; i++) {
            const pid = String(filtered[i].id);
            if (!seenBatch.has(pid)) {
              seenBatch.add(pid);
              uniqueBatch.push(filtered[i]);
            }
          }
          const enriched = await this.runExploreBatched(
            uniqueBatch.slice(0, 24),
            5,
            currentReqId,
            (p) => this.enrichExplorePersonCountry(p),
          );
          if (!enriched || currentReqId !== this.exploreReqId) return;
          for (
            let i = 0;
            i < uniqueBatch.length && collected.length < 20;
            i++
          ) {
            const p = uniqueBatch[i];
            const pid = String(p.id);
            if (this.exploreSeenIds.has(pid)) continue;
            if (p._country && countries.includes(p._country)) {
              this.exploreSeenIds.add(pid);
              collected.push(p);
            }
          }
        } else {
          for (let i = 0; i < filtered.length; i++) {
            const p = filtered[i];
            const pid = String(p.id);
            if (this.exploreSeenIds.has(pid)) continue;
            this.exploreSeenIds.add(pid);
            if (
              this._personCountryCache &&
              this._personCountryCache[pid] !== undefined
            ) {
              p._country = this._personCountryCache[pid];
            }
            collected.push(p);
          }
        }
        if (
          !res ||
          !res.results ||
          res.results.length === 0 ||
          (res.total_pages && this._personExploreRawPage >= res.total_pages)
        ) {
          this.exploreHasMore = false;
          break;
        }
      }
      if (currentReqId !== this.exploreReqId) return;
      if (collected.length > 0) {
        const cacheKeys = Object.keys(this._explorePeopleCache);
        if (cacheKeys.length >= 20)
          delete this._explorePeopleCache[cacheKeys[0]];
        this._explorePeopleCache[cacheKey] = collected;
      }
      this.exploreLoading = false;
      if (collected.length > 0) {
        const html = collected
          .map((p) => this.buildPersonExploreCard(p))
          .join("");
        this.appendExploreGridHtml(
          grid,
          html,
          pg === 1 || !grid.querySelector(".poster-card"),
        );
        this.markImgsLoaded(grid.querySelectorAll("img"));
        if (countries.length === 0)
          this.enrichPeopleCountriesQueue(collected, currentReqId);
      } else if (pg === 1 && !grid.querySelector(".poster-card")) {
        grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
      }
    } catch (err) {
      if (currentReqId === this.exploreReqId) {
        this.exploreLoading = false;
        if (this.explorePage === 1)
          grid.innerHTML = '<div class="msg-box">Error loading content.</div>';
      }
    } finally {
      if (bottomLoader && bottomLoader.parentNode) bottomLoader.remove();
      if (currentReqId === this.exploreReqId) {
        const lingeringL = grid ? grid.querySelector(".dots-loader") : null;
        if (lingeringL) lingeringL.remove();
        this.exploreLoading = false;
        this.stopLoader();
      }
    }
  },
  async loadExploreCompanies(currentReqId, grid) {
    let bottomLoader = null;
    try {
      const sortType = this.$g("filter-type")?.value || "all";
      const types = this.getMultiList("exp-role", "company", "explore").map(
        (r) => r.id,
      );
      const countries = this.getMultiList("country", "company", "explore").map(
        (c) => c.id,
      );
      const tmdbC = countries.map((c) => (c === "UK" ? "GB" : c)).join("|");
      const hasTypeFilter = types.length > 0;
      const incPlatform = !hasTypeFilter || types.includes("platform");
      const incMovie = !hasTypeFilter || types.includes("movie_studio");
      const incTv = !hasTypeFilter || types.includes("tv_network");
      const incAnime = !hasTypeFilter || types.includes("movie_studio");
      const pg = this.explorePage;
      const isDefaultTiered = !hasTypeFilter && countries.length === 0;
      const isRandPage = pg >= 4;
      const cacheKey =
        sortType +
        "|" +
        types.slice().sort().join(",") +
        "|" +
        countries.slice().sort().join(",") +
        "|" +
        pg;
      if (!this._exploreCompaniesCache)
        this._exploreCompaniesCache =
          this.$sessGet("str_c_comp_cache_v5", {}) || {};
      if (!isRandPage && this._exploreCompaniesCache[cacheKey]) {
        const cachedList = this._exploreCompaniesCache[cacheKey].filter(
          (c) => !this.exploreSeenIds.has(c._seenKey),
        );
        cachedList.forEach((c) => this.exploreSeenIds.add(c._seenKey));
        this.exploreLoading = false;
        if (cachedList.length > 0) {
          const html = cachedList
            .map((c) => this.buildCompanyExploreCard(c))
            .join("");
          if (pg === 1 || !grid.querySelector(".poster-card"))
            grid.innerHTML = html;
          else grid.insertAdjacentHTML("beforeend", html);
          this.markImgsLoaded(grid.querySelectorAll("img"));
          if (hasTypeFilter && types.length === 1 && types[0] === "platform")
            this.exploreHasMore = false;
        } else if (pg === 1 && !grid.querySelector(".poster-card")) {
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
        }
        this.stopLoader();
        return;
      }
      if (pg === 1) {
        grid.innerHTML = DOTS_HTML;
      } else {
        const oldL = grid.querySelector(".dots-loader");
        if (oldL) oldL.remove();
        bottomLoader = document.createElement("div");
        bottomLoader.className = "dots-loader";
        bottomLoader.style.gridColumn = "1 / -1";
        bottomLoader.style.minHeight = "0";
        bottomLoader.style.padding = "16px 0 28px";
        bottomLoader.innerHTML =
          '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        grid.appendChild(bottomLoader);
      }
      const key = this.getTmdbAnimeKey();
      const cParam = tmdbC ? { with_origin_country: tmdbC } : {};
      const randPg = () => Math.floor(Math.random() * 25) + 2;
      const reqs = [];
      const isPlatRe =
        /\b(netflix|apple\s*tv\+?|disney\+?|prime\s*video|amazon|hulu|peacock|paramount\+?|max|hbo\s*max|crunchyroll|youtube|tubi|pluto|mgm\+?|starz|showtime|discovery\+?|espn\+?|shudder|mubi|britbox|acorn\s*tv|roku|freevee|crackle|bet\+|amc\+|epix)\b/i;
      const jpTvNetRe =
        /\b(tv\s*tokyo|fuji\s*tv|fuji\s*television|tokyo\s*broadcasting|tbs|nippon\s*tv|nippon\s*television|tv\s*asahi|nhk|mainichi\s*broadcasting|mbs|tokyo\s*mx|at-x|bs11|bs\s*fuji|kansai\s*tv|kansai\s*telecasting|yomiuri\s*telecasting|ytv|chubu-nippon|cbc|tv\s*aichi|tv\s*osaka|hokkaido\s*television|animax|wowow)\b/i;
      const platNetIds = [
        "213",
        "1024",
        "2739",
        "2552",
        "453",
        "6703",
        "3186",
        "4330",
        "3353",
        "1112",
        "318",
        "67",
        "4353",
        "6219",
        "4883",
        "2542",
        "2700",
        "2697",
        "2707",
        "1436",
        "4692",
        "3626",
        "3343",
        "3039",
        "3475",
        "1081",
      ];
      const mSort =
        sortType === "revenue"
          ? "revenue.desc"
          : sortType === "top_rated"
            ? "vote_count.desc"
            : "popularity.desc";
      const tSort =
        sortType === "top_rated" ? "vote_count.desc" : "popularity.desc";
      const shouldResolvePlatNets =
        incPlatform &&
        pg === 1 &&
        (isDefaultTiered ||
          countries.length === 0 ||
          countries.some((c) => ["US", "UK", "CA", "AU"].includes(c)));
      if (isRandPage) {
        const sortPool = ["popularity.desc", "vote_count.desc", "revenue.desc"];
        const rmSort =
          sortType === "top_rated"
            ? "vote_count.desc"
            : sortPool[Math.floor(Math.random() * sortPool.length)];
        const rtSort =
          sortType === "top_rated"
            ? "vote_count.desc"
            : Math.random() < 0.5
              ? "popularity.desc"
              : "vote_count.desc";
        if (incMovie)
          reqs.push(
            this.api(
              "/discover/movie",
              {
                sort_by: rmSort,
                without_genres: "16",
                page: randPg(),
                ...cParam,
              },
              key,
            )
              .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "movie", list: [] })),
          );
        if (incTv || incPlatform)
          reqs.push(
            this.api(
              "/discover/tv",
              {
                sort_by: rtSort,
                without_genres: "16",
                page: randPg(),
                ...cParam,
              },
              key,
            )
              .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "tv", list: [] })),
          );
        if (incAnime && (countries.length === 0 || countries.includes("JP")))
          reqs.push(
            this.api(
              "/discover/tv",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: rtSort,
                page: Math.floor(Math.random() * 10) + 2,
                ...cParam,
              },
              key,
            )
              .then((r) => ({ tier: "anime", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "anime", list: [] })),
          );
      } else if (isDefaultTiered) {
        if (pg === 1) {
          if (sortType === "trending") {
            reqs.push(
              this.api("/trending/tv/week", { page: 1 }, key)
                .then((r) => ({
                  tier: "platform",
                  list: ((r && r.results) || []).slice(0, 10),
                }))
                .catch(() => ({ tier: "platform", list: [] })),
            );
          } else {
            reqs.push(
              this.api(
                "/discover/tv",
                {
                  sort_by: tSort,
                  with_networks: platNetIds.slice(0, 14).join("|"),
                  without_genres: "16",
                  page: 1,
                },
                key,
              )
                .then((r) => ({
                  tier: "platform",
                  list: ((r && r.results) || []).slice(0, 10),
                }))
                .catch(() => ({ tier: "platform", list: [] })),
            );
          }
        } else if (pg === 2) {
          if (sortType === "trending") {
            reqs.push(
              this.api("/trending/movie/week", { page: 1 }, key)
                .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "movie", list: [] })),
            );
            reqs.push(
              this.api("/trending/movie/week", { page: 2 }, key)
                .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "movie", list: [] })),
            );
            reqs.push(
              this.api("/trending/tv/week", { page: 1 }, key)
                .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "tv", list: [] })),
            );
            reqs.push(
              this.api("/trending/tv/week", { page: 2 }, key)
                .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "tv", list: [] })),
            );
          } else {
            reqs.push(
              this.api(
                "/discover/movie",
                { sort_by: mSort, without_genres: "16", page: 1 },
                key,
              )
                .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "movie", list: [] })),
            );
            reqs.push(
              this.api(
                "/discover/movie",
                {
                  sort_by:
                    sortType === "top_rated"
                      ? "vote_count.desc"
                      : "revenue.desc",
                  without_genres: "16",
                  page: sortType === "top_rated" ? 2 : 1,
                },
                key,
              )
                .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "movie", list: [] })),
            );
            reqs.push(
              this.api(
                "/discover/tv",
                { sort_by: tSort, without_genres: "16", page: 1 },
                key,
              )
                .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "tv", list: [] })),
            );
            reqs.push(
              this.api(
                "/discover/tv",
                {
                  sort_by: "vote_count.desc",
                  without_genres: "16",
                  page: sortType === "top_rated" ? 2 : 1,
                },
                key,
              )
                .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "tv", list: [] })),
            );
          }
        } else if (pg === 3) {
          reqs.push(
            this.api(
              "/discover/tv",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: tSort,
                page: 1,
              },
              key,
            )
              .then((r) => ({ tier: "anime", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "anime", list: [] })),
          );
          reqs.push(
            this.api(
              "/discover/tv",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: tSort,
                page: 2,
              },
              key,
            )
              .then((r) => ({ tier: "anime", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "anime", list: [] })),
          );
          reqs.push(
            this.api(
              "/discover/tv",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: "vote_count.desc",
                page: 1,
              },
              key,
            )
              .then((r) => ({ tier: "anime", list: (r && r.results) || [] }))
              .catch(() => ({ tier: "anime", list: [] })),
          );
          reqs.push(
            this.api(
              "/discover/movie",
              {
                with_genres: "16",
                with_original_language: "ja",
                sort_by: tSort,
                page: 1,
              },
              key,
            )
              .then((r) => ({
                tier: "anime_movie",
                list: (r && r.results) || [],
              }))
              .catch(() => ({ tier: "anime_movie", list: [] })),
          );
        }
      } else {
        const isOnlyPlat =
          hasTypeFilter && types.length === 1 && types[0] === "platform";
        if (!isOnlyPlat) {
          if (incMovie) {
            reqs.push(
              this.api(
                "/discover/movie",
                { sort_by: mSort, without_genres: "16", page: pg, ...cParam },
                key,
              )
                .then((r) => ({ tier: "movie", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "movie", list: [] })),
            );
          }
          if (incTv) {
            reqs.push(
              this.api(
                "/discover/tv",
                { sort_by: tSort, without_genres: "16", page: pg, ...cParam },
                key,
              )
                .then((r) => ({ tier: "tv", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "tv", list: [] })),
            );
          }
          if (
            incAnime &&
            (countries.length === 0 || countries.includes("JP"))
          ) {
            reqs.push(
              this.api(
                "/discover/tv",
                {
                  with_genres: "16",
                  with_original_language: "ja",
                  sort_by: tSort,
                  page: pg,
                  ...cParam,
                },
                key,
              )
                .then((r) => ({ tier: "anime", list: (r && r.results) || [] }))
                .catch(() => ({ tier: "anime", list: [] })),
            );
            reqs.push(
              this.api(
                "/discover/movie",
                {
                  with_genres: "16",
                  with_original_language: "ja",
                  sort_by: tSort,
                  page: pg,
                  ...cParam,
                },
                key,
              )
                .then((r) => ({
                  tier: "anime_movie",
                  list: (r && r.results) || [],
                }))
                .catch(() => ({ tier: "anime_movie", list: [] })),
            );
          }
        } else if (pg === 1) {
          reqs.push(
            this.api(
              "/discover/tv",
              {
                sort_by: tSort,
                with_networks: platNetIds.slice(0, 14).join("|"),
                without_genres: "16",
                page: 1,
                ...cParam,
              },
              key,
            )
              .then((r) => ({
                tier: "platform",
                list: ((r && r.results) || []).slice(0, 10),
              }))
              .catch(() => ({ tier: "platform", list: [] })),
          );
        }
      }
      const [discRes, resolvedPlatNets] = await Promise.all([
        Promise.all(reqs),
        shouldResolvePlatNets
          ? this.runExploreBatched(platNetIds, 6, currentReqId, (nid) =>
              this.api("/network/" + nid, {}, key).catch(() => null),
            )
          : Promise.resolve([]),
      ]);
      if (!resolvedPlatNets || currentReqId !== this.exploreReqId) return;
      const detailMap = new Map();
      const sliceCount =
        isDefaultTiered && pg === 1
          ? 8
          : isDefaultTiered || (hasTypeFilter && types.length === 1)
            ? 12
            : 10;
      for (let idx = 0; idx < sliceCount; idx++) {
        discRes.forEach((group) => {
          const item = group.list && group.list[idx];
          if (!item || !item.id) return;
          const mType =
            group.tier === "movie" || group.tier === "anime_movie"
              ? "movie"
              : "tv";
          const dKey = mType + "_" + item.id;
          if (!detailMap.has(dKey)) {
            detailMap.set(dKey, {
              mType,
              id: item.id,
              tiers: new Set([group.tier]),
            });
          } else {
            detailMap.get(dKey).tiers.add(group.tier);
          }
        });
      }
      const maxDet = isDefaultTiered && pg === 1 ? 8 : 32;
      const detailTargets = Array.from(detailMap.values()).slice(0, maxDet);
      const details =
        detailTargets.length > 0
          ? await this.runExploreBatched(
              detailTargets,
              6,
              currentReqId,
              (entry) =>
                this.api("/" + entry.mType + "/" + entry.id, {}, key)
                  .then((d) => ({ tiers: entry.tiers, data: d }))
                  .catch(() => null),
            )
          : [];
      if (!details || currentReqId !== this.exploreReqId) return;
      const poolPlatform = new Map();
      const seenPlatNames = new Set();
      const poolMain = new Map();
      const poolAnime = new Map();
      const normPlatName = (name) =>
        String(name || "")
          .toLowerCase()
          .replace(/^hbo\s+max$/, "max")
          .replace(/\s+plus$/, "")
          .replace(/\+$/, "")
          .trim();
      const addToPool = (pool, c, sourceType, catLabel, baseScore = 1) => {
        if (!c || !c.id || !c.logo_path) return;
        const seenKey = sourceType + "_" + c.id;
        if (this.exploreSeenIds.has(seenKey)) return;
        let normCtry =
          c.origin_country ||
          (c.headquarters
            ? this.extractCountryCodeFromBirthplace(c.headquarters)
            : "") ||
          "";
        if (normCtry === "GB") normCtry = "UK";
        if (!normCtry && catLabel === "PLATFORM") normCtry = "US";
        if (countries.length > 0 && !countries.includes(normCtry)) return;
        if (catLabel === "PLATFORM") {
          const nKey = normPlatName(c.name);
          if (seenPlatNames.has(nKey) && !pool.has(seenKey)) return;
          seenPlatNames.add(nKey);
        }
        const existing = pool.get(seenKey);
        if (existing) {
          existing._score += baseScore;
        } else {
          pool.set(seenKey, {
            id: c.id,
            name: c.name,
            logo_path: c.logo_path,
            origin_country: normCtry,
            _sourceType: sourceType,
            _catLabel: catLabel,
            _seenKey: seenKey,
            _score: baseScore,
          });
        }
      };
      const westernCodes = new Set(["US", "UK", "GB", "CA", "AU", ""]);
      if (shouldResolvePlatNets && Array.isArray(resolvedPlatNets)) {
        resolvedPlatNets.forEach((n, idx) => {
          if (!n || !n.id || !n.logo_path) return;
          const ctry =
            n.origin_country ||
            this.extractCountryCodeFromBirthplace(n.headquarters) ||
            "US";
          if (!this.discoveredNetworks) this.discoveredNetworks = {};
          this.discoveredNetworks[n.id] = {
            ...n,
            origin_country: ctry === "GB" ? "UK" : ctry,
          };
          addToPool(
            poolPlatform,
            n,
            "network",
            "PLATFORM",
            Math.max(1, platNetIds.length - idx),
          );
        });
      }
      details.forEach((entry) => {
        const d = entry && entry.data;
        if (!d) return;
        const tiers = entry.tiers;
        if (tiers.has("platform")) {
          (d.networks || []).forEach((n) => {
            const nCtry = (n && n.origin_country) || "";
            if (n && isPlatRe.test(n.name || "") && westernCodes.has(nCtry)) {
              addToPool(poolPlatform, n, "network", "PLATFORM", 30);
            }
          });
        }
        if (tiers.has("movie")) {
          (d.production_companies || []).forEach((c) => {
            if (c && !isPlatRe.test(c.name || ""))
              addToPool(poolMain, c, "company", "STUDIO", 1);
          });
        }
        if (tiers.has("tv")) {
          (d.networks || []).forEach((n) => {
            const isPlat = n && isPlatRe.test(n.name || "");
            if (
              isPlat &&
              incPlatform &&
              !isDefaultTiered &&
              westernCodes.has((n && n.origin_country) || "")
            ) {
              addToPool(poolPlatform, n, "network", "PLATFORM", 5);
            } else if (
              incTv &&
              !isPlat &&
              !jpTvNetRe.test((n && n.name) || "")
            ) {
              addToPool(poolMain, n, "network", "NETWORK", 1);
            }
          });
        }
        if (tiers.has("anime") || tiers.has("anime_movie")) {
          (d.production_companies || []).forEach((c) => {
            if (
              c &&
              !jpTvNetRe.test(c.name || "") &&
              !isPlatRe.test(c.name || "")
            ) {
              addToPool(poolAnime, c, "company", "STUDIO", 1);
            }
          });
        }
      });
      let collected = [];
      if (isRandPage) {
        const merged = [
          ...poolPlatform.values(),
          ...poolMain.values(),
          ...poolAnime.values(),
        ];
        for (let i = merged.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = merged[i];
          merged[i] = merged[j];
          merged[j] = tmp;
        }
        merged.forEach((item) => {
          if (!this.exploreSeenIds.has(item._seenKey)) {
            this.exploreSeenIds.add(item._seenKey);
            collected.push(item);
          }
        });
      } else {
        const byScore = (a, b) => b._score - a._score;
        const platList = Array.from(poolPlatform.values())
          .sort(byScore)
          .slice(0, 28);
        const mainList = Array.from(poolMain.values())
          .sort(byScore)
          .slice(0, 32);
        const animeList = Array.from(poolAnime.values())
          .sort(byScore)
          .slice(0, 32);
        const pageItems =
          isDefaultTiered && pg === 1
            ? platList
            : isDefaultTiered && pg === 2
              ? mainList
              : isDefaultTiered && pg === 3
                ? animeList
                : [...platList, ...mainList, ...animeList];
        pageItems.forEach((item) => {
          if (!this.exploreSeenIds.has(item._seenKey)) {
            this.exploreSeenIds.add(item._seenKey);
            collected.push(item);
          }
        });
      }
      if (currentReqId !== this.exploreReqId) return;
      if (!isRandPage && collected.length > 0) {
        const cacheKeys = Object.keys(this._exploreCompaniesCache);
        if (cacheKeys.length >= 20)
          delete this._exploreCompaniesCache[cacheKeys[0]];
        this._exploreCompaniesCache[cacheKey] = collected;
        this.$sessSet("str_c_comp_cache_v5", this._exploreCompaniesCache);
      }
      this.exploreLoading = false;
      if (hasTypeFilter && types.length === 1 && types[0] === "platform") {
        this.exploreHasMore = false;
      }
      if (collected.length > 0) {
        const html = collected
          .map((c) => this.buildCompanyExploreCard(c))
          .join("");
        this.appendExploreGridHtml(
          grid,
          html,
          pg === 1 || !grid.querySelector(".poster-card"),
        );
        this.markImgsLoaded(grid.querySelectorAll("img"));
      } else if (isDefaultTiered && pg < 4) {
        this.explorePage++;
        return this.loadExploreCompanies(currentReqId, grid);
      } else {
        if (details.length === 0) this.exploreHasMore = false;
        if (pg === 1 && !grid.querySelector(".poster-card")) {
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
        }
      }
    } catch (err) {
      if (currentReqId === this.exploreReqId) {
        this.exploreLoading = false;
        if (this.explorePage === 1)
          grid.innerHTML = '<div class="msg-box">Error loading content.</div>';
      }
    } finally {
      if (bottomLoader && bottomLoader.parentNode) bottomLoader.remove();
      if (currentReqId === this.exploreReqId) {
        const lingeringL = grid ? grid.querySelector(".dots-loader") : null;
        if (lingeringL) lingeringL.remove();
        this.exploreLoading = false;
        this.stopLoader();
      }
    }
  },
  toggleExploreEntitySearch() {
    this.exploreEntitySearchOpen = true;
    this.updateExploreEntitySearchUI();
    const inp = this.$g("explore-entity-search-input");
    if (inp) setTimeout(() => inp.focus(), 20);
  },
  closeExploreEntitySearch() {
    this.clearExploreEntitySearch(true);
  },
  updateExploreEntitySearchUI() {
    const isEntity =
      this.exploreType === "person" || this.exploreType === "company";
    const expRoleInp = this.$g("filter-exp-role-input");
    if (expRoleInp && isEntity)
      expRoleInp.placeholder =
        this.exploreType === "person" ? "Department" : "Type";
    const btn = this.$g("btn-explore-search");
    const wrap = this.$g("explore-entity-search-wrap");
    const inp = this.$g("explore-entity-search-input");
    if (!isEntity) {
      if (btn) {
        btn.style.display = "none";
        btn.classList.remove("active");
      }
      if (wrap) wrap.style.display = "none";
      return;
    }
    if (btn) {
      btn.style.display = this.exploreEntitySearchOpen ? "none" : "inline-flex";
      btn.classList.remove("active");
    }
    if (wrap)
      wrap.style.display = this.exploreEntitySearchOpen
        ? "inline-flex"
        : "none";
    if (inp) {
      inp.placeholder =
        this.exploreType === "company"
          ? "Search companies..."
          : "Search people...";
    }
  },
  onExploreEntitySearchInput(val) {
    const q = String(val || "").trim();
    clearTimeout(this.exploreEntitySearchTimer);
    if (q === (this.exploreEntitySearchQuery || "")) return;
    this.exploreEntitySearchTimer = setTimeout(() => {
      this.exploreEntitySearchQuery = q;
      this.resetExplore(false);
    }, 380);
  },
  triggerExploreEntitySearch() {
    clearTimeout(this.exploreEntitySearchTimer);
    const inp = this.$g("explore-entity-search-input");
    const q = inp ? inp.value.trim() : "";
    this.exploreEntitySearchQuery = q;
    this.resetExplore(false);
  },
  clearExploreEntitySearch(keepClosed = false) {
    clearTimeout(this.exploreEntitySearchTimer);
    const hadQuery = Boolean((this.exploreEntitySearchQuery || "").trim());
    this.exploreEntitySearchQuery = "";
    if (keepClosed) this.exploreEntitySearchOpen = false;
    const inp = this.$g("explore-entity-search-input");
    if (inp) inp.value = "";
    this.updateExploreEntitySearchUI();
    if (!keepClosed && this.exploreEntitySearchOpen && inp) inp.focus();
    if (hadQuery) this.resetExplore(false);
  },
  toggleCatalogSearch(scope) {
    this[scope + "SearchOpen"] = true;
    this.updateCatalogSearchUI(scope);
    const inp = this.$g(scope + "-search-input");
    if (inp) setTimeout(() => inp.focus(), 20);
  },
  closeCatalogSearch(scope) {
    this.clearCatalogSearch(scope, true);
  },
  updateCatalogSearchUI(scope) {
    const isOpen = Boolean(this[scope + "SearchOpen"]);
    const btn = this.$g("btn-" + scope + "-search");
    const wrap = this.$g(scope + "-search-wrap");
    if (btn) {
      btn.style.display = isOpen ? "none" : "inline-flex";
      btn.classList.remove("active");
    }
    if (wrap) wrap.style.display = isOpen ? "inline-flex" : "none";
  },
  onCatalogSearchInput(scope, val) {
    const q = String(val || "").trim();
    clearTimeout(this[scope + "SearchTimer"]);
    if (q === (this[scope + "SearchQuery"] || "")) return;
    this[scope + "SearchTimer"] = setTimeout(() => {
      this[scope + "SearchQuery"] = q;
      if (scope === "person") this.applyPersonFilters();
      else if (scope === "source") this.applySourceFilters();
    }, 280);
  },
  triggerCatalogSearch(scope) {
    clearTimeout(this[scope + "SearchTimer"]);
    const inp = this.$g(scope + "-search-input");
    this[scope + "SearchQuery"] = inp ? inp.value.trim() : "";
    if (scope === "person") this.applyPersonFilters();
    else if (scope === "source") this.applySourceFilters();
  },
  clearCatalogSearch(scope, keepClosed = false) {
    clearTimeout(this[scope + "SearchTimer"]);
    const hadQuery = Boolean((this[scope + "SearchQuery"] || "").trim());
    this[scope + "SearchQuery"] = "";
    if (keepClosed) this[scope + "SearchOpen"] = false;
    const inp = this.$g(scope + "-search-input");
    if (inp) inp.value = "";
    this.updateCatalogSearchUI(scope);
    if (!keepClosed && this[scope + "SearchOpen"] && inp) inp.focus();
    if (hadQuery) {
      if (scope === "person") this.applyPersonFilters();
      else if (scope === "source") this.applySourceFilters();
    }
  },
  async loadExploreEntitySearch(currentReqId, grid) {
    let bottomLoader = null;
    try {
      const q = (this.exploreEntitySearchQuery || "").trim();
      if (!q) return;
      const isCompany = this.exploreType === "company";
      const pg = this.explorePage;
      if (pg === 1) {
        this._entitySearchRawPage = 0;
        grid.innerHTML = DOTS_HTML;
      } else {
        const oldL = grid.querySelector(".dots-loader");
        if (oldL) oldL.remove();
        bottomLoader = document.createElement("div");
        bottomLoader.className = "dots-loader";
        bottomLoader.style.gridColumn = "1 / -1";
        bottomLoader.style.minHeight = "0";
        bottomLoader.style.padding = "16px 0 28px";
        bottomLoader.innerHTML =
          '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        grid.appendChild(bottomLoader);
      }
      const collected = [];
      if (isCompany) {
        const types = this.getMultiList("exp-role", "company", "explore").map(
          (r) => r.id,
        );
        const countries = this.getMultiList(
          "country",
          "company",
          "explore",
        ).map((c) => c.id);
        const hasTypeFilter = types.length > 0;
        const incPlatform = !hasTypeFilter || types.includes("platform");
        const incMovie = !hasTypeFilter || types.includes("movie_studio");
        const incTv = !hasTypeFilter || types.includes("tv_network");
        const qLow = q.toLowerCase();
        const matchesType = (cat) =>
          (cat === "PLATFORM" && incPlatform) ||
          (cat === "NETWORK" && incTv) ||
          (cat === "STUDIO" && incMovie);
        if (pg === 1) {
          if (!this._exploreCompaniesCache)
            this._exploreCompaniesCache =
              this.$sessGet("str_c_comp_cache_v5", {}) || {};
          const localPool = [];
          Object.values(this._exploreCompaniesCache).forEach((arr) => {
            if (Array.isArray(arr)) localPool.push(...arr);
          });
          Object.values(this.discoveredNetworks || {}).forEach((n) => {
            if (n && n.id && n.logo_path && n.name) {
              const isPlat =
                /\b(netflix|apple\s*tv\+?|disney\+?|prime\s*video|amazon|hulu|peacock|paramount\+?|max|hbo\s*max|crunchyroll|youtube|tubi|pluto|mgm\+?|starz|showtime|discovery\+?|espn\+?|shudder|mubi|britbox|acorn\s*tv|roku|freevee)\b/i.test(
                  n.name,
                );
              localPool.push({
                id: n.id,
                name: n.name,
                logo_path: n.logo_path,
                origin_country: n.origin_country || "",
                _sourceType: "network",
                _catLabel: isPlat ? "PLATFORM" : "NETWORK",
                _seenKey: "network_" + n.id,
              });
            }
          });
          localPool.sort((a, b) => {
            const aStart = (a.name || "").toLowerCase().startsWith(qLow)
              ? 0
              : 1;
            const bStart = (b.name || "").toLowerCase().startsWith(qLow)
              ? 0
              : 1;
            return aStart - bStart;
          });
          const seenLocalPlatNames = new Set();
          localPool.forEach((c) => {
            if (!c || !c.id || !c.logo_path || !c.name) return;
            if (!c.name.toLowerCase().includes(qLow)) return;
            const cat =
              c._catLabel ||
              (c._sourceType === "network" ? "NETWORK" : "STUDIO");
            if (!matchesType(cat)) return;
            let normCtry = c.origin_country || "";
            if (normCtry === "GB") normCtry = "UK";
            if (countries.length > 0 && !countries.includes(normCtry)) return;
            if (cat === "PLATFORM") {
              const normN = c.name.toLowerCase().trim();
              if (seenLocalPlatNames.has(normN)) return;
              seenLocalPlatNames.add(normN);
            }
            const seenKey =
              c._seenKey || (c._sourceType || "company") + "_" + c.id;
            if (this.exploreSeenIds.has(seenKey)) return;
            this.exploreSeenIds.add(seenKey);
            collected.push({
              ...c,
              origin_country: normCtry,
              _seenKey: seenKey,
              _catLabel: cat,
            });
          });
        }
        if (incMovie) {
          let scans = 0;
          const maxScans = countries.length > 0 ? 4 : 3;
          while (collected.length < 24 && scans < maxScans) {
            scans++;
            this._entitySearchRawPage = (this._entitySearchRawPage || 0) + 1;
            const res = await this.api(
              "/search/company",
              { query: q, page: this._entitySearchRawPage },
              this.getTmdbAnimeKey(),
            ).catch(() => null);
            if (currentReqId !== this.exploreReqId) return;
            const list = (res && res.results) || [];
            list.forEach((c) => {
              if (!c || !c.id || !c.logo_path) return;
              let normCtry = c.origin_country || "";
              if (normCtry === "GB") normCtry = "UK";
              if (countries.length > 0 && !countries.includes(normCtry)) return;
              const seenKey = "company_" + c.id;
              if (this.exploreSeenIds.has(seenKey)) return;
              this.exploreSeenIds.add(seenKey);
              collected.push({
                id: c.id,
                name: c.name,
                logo_path: c.logo_path,
                origin_country: normCtry,
                _sourceType: "company",
                _catLabel: "STUDIO",
                _seenKey: seenKey,
              });
            });
            if (
              !res ||
              !res.results ||
              res.results.length === 0 ||
              (res.total_pages && this._entitySearchRawPage >= res.total_pages)
            ) {
              this.exploreHasMore = false;
              break;
            }
          }
        } else {
          this.exploreHasMore = false;
        }
        if (currentReqId !== this.exploreReqId) return;
        this.exploreLoading = false;
        if (collected.length > 0) {
          const html = collected
            .map((c) => this.buildCompanyExploreCard(c))
            .join("");
          this.appendExploreGridHtml(
            grid,
            html,
            pg === 1 || !grid.querySelector(".poster-card"),
          );
          this.markImgsLoaded(grid.querySelectorAll("img"));
        } else if (pg === 1 && !grid.querySelector(".poster-card")) {
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
        }
      } else {
        const roles = this.getMultiList("exp-role", "person", "explore").map(
          (r) => r.id,
        );
        const countries = this.getMultiList("country", "person", "explore").map(
          (c) => c.id,
        );
        let scans = 0;
        const maxScans = roles.length > 0 || countries.length > 0 ? 4 : 2;
        while (collected.length < 20 && scans < maxScans) {
          scans++;
          this._entitySearchRawPage = (this._entitySearchRawPage || 0) + 1;
          const res = await this.api(
            "/search/person",
            { query: q, page: this._entitySearchRawPage },
            this.getTmdbAnimeKey(),
          ).catch(() => null);
          if (currentReqId !== this.exploreReqId) return;
          const rawList = (res && res.results) || [];
          const filtered = rawList.filter((p) => {
            if (!p || !p.id || !p.profile_path || p.adult) return false;
            const pid = String(p.id);
            if (this.exploreSeenIds.has(pid)) return false;
            if (
              roles.length > 0 &&
              !roles.includes(p.known_for_department || "Acting")
            )
              return false;
            return true;
          });
          if (countries.length > 0) {
            const enriched = await this.runExploreBatched(
              filtered.slice(0, 20),
              5,
              currentReqId,
              (p) => this.enrichExplorePersonCountry(p),
            );
            if (!enriched || currentReqId !== this.exploreReqId) return;
            for (let i = 0; i < filtered.length && collected.length < 20; i++) {
              const p = filtered[i];
              const pid = String(p.id);
              if (this.exploreSeenIds.has(pid)) continue;
              if (p._country && countries.includes(p._country)) {
                this.exploreSeenIds.add(pid);
                collected.push(p);
              }
            }
          } else {
            filtered.forEach((p) => {
              const pid = String(p.id);
              if (this.exploreSeenIds.has(pid)) return;
              this.exploreSeenIds.add(pid);
              if (
                this._personCountryCache &&
                this._personCountryCache[pid] !== undefined
              ) {
                p._country = this._personCountryCache[pid];
              }
              collected.push(p);
            });
          }
          if (
            !res ||
            !res.results ||
            res.results.length === 0 ||
            (res.total_pages && this._entitySearchRawPage >= res.total_pages)
          ) {
            this.exploreHasMore = false;
            break;
          }
        }
        if (currentReqId !== this.exploreReqId) return;
        this.exploreLoading = false;
        if (collected.length > 0) {
          const html = collected
            .map((p) => this.buildPersonExploreCard(p))
            .join("");
          this.appendExploreGridHtml(
            grid,
            html,
            pg === 1 || !grid.querySelector(".poster-card"),
          );
          this.markImgsLoaded(grid.querySelectorAll("img"));
          if (countries.length === 0)
            this.enrichPeopleCountriesQueue(collected, currentReqId);
        } else if (pg === 1 && !grid.querySelector(".poster-card")) {
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
        }
      }
    } catch (err) {
      if (currentReqId === this.exploreReqId) {
        this.exploreLoading = false;
        if (this.explorePage === 1)
          grid.innerHTML = '<div class="msg-box">Error loading content.</div>';
      }
    } finally {
      if (bottomLoader && bottomLoader.parentNode) bottomLoader.remove();
      if (currentReqId === this.exploreReqId) {
        const lingeringL = grid ? grid.querySelector(".dots-loader") : null;
        if (lingeringL) lingeringL.remove();
        this.exploreLoading = false;
        this.stopLoader();
      }
    }
  },
  async loadExplore() {
    if (this.exploreLoading) return;
    this.exploreLoading = true;
    const currentReqId = ++this.exploreReqId;
    const tEl = this.$g("explore-title");
    const titleMap = {
      movie: "Movies",
      tv: "Shows",
      company: "Companies",
      person: "People",
    };
    if (tEl) tEl.innerText = titleMap[this.exploreType] || "Movies";
    ["tv", "movie", "company", "person"].forEach((k) => {
      const sw = this.$g("explore-switch-" + k);
      if (sw) {
        sw.style.display = "";
        sw.classList.toggle("active", k === this.exploreType);
      }
    });
    const grid = this.$g("explore-grid");
    if (!this.exploreSeenIds || this.explorePage === 1) {
      this.exploreSeenIds = new Set();
      grid.innerHTML = "";
    }
    if (
      (this.exploreType === "person" || this.exploreType === "company") &&
      (this.exploreEntitySearchQuery || "").trim()
    ) {
      await this.loadExploreEntitySearch(currentReqId, grid);
      return;
    }
    if (this.exploreType === "person") {
      await this.loadExplorePeople(currentReqId, grid);
      return;
    }
    if (this.exploreType === "company") {
      await this.loadExploreCompanies(currentReqId, grid);
      return;
    }
    const type = this.$g("filter-type")?.value || "all";
    const fState = this.getExploreFilterState();
    const {
      hasAnime,
      normalGenreIds,
      genre2Ids,
      years,
      countries,
      personIds,
      seasonIds,
      aniStudioIds,
      aniStaffIds,
    } = fState;
    const currentYear = new Date().getFullYear();
    const baseParams = this.buildTmdbDiscoverParams(fState);
    const curType = type;
    const isTypeTrigger =
      (this.exploreType === "movie" &&
        (curType === "revenue" ||
          curType === "top_rated" ||
          (hasAnime && curType === "popular"))) ||
      (this.exploreType === "tv" &&
        (curType === "top_rated" ||
          (hasAnime && (curType === "popular" || curType === "specials"))));
    const hasFilter =
      ["genre", "compNet", "country", "person", "aniStudio", "aniStaff"].some(
        (k) => this.getMultiList(k, this.exploreType).length > 0,
      ) ||
      years.length > 1 ||
      isTypeTrigger;
    const isAllOrMultiYears = years.length === 0 || years.length > 1;
    const isYearSortActive =
      hasFilter && isAllOrMultiYears && Boolean(this.yearSortOrder);
    if (isYearSortActive) {
      const sortOrder = this.yearSortOrder;
      const dPfx = this.getTmdbDatePrefix(this.exploreType);
      baseParams.sort_by = sortOrder === "asc" ? `${dPfx}.asc` : `${dPfx}.desc`;
      if (sortOrder === "desc") {
        const today = new Date().toISOString().split("T")[0];
        if (!baseParams[`${dPfx}.lte`]) baseParams[`${dPfx}.lte`] = today;
      } else {
        if (!baseParams[`${dPfx}.gte`])
          baseParams[`${dPfx}.gte`] =
            this.exploreType === "movie" ? "1900-01-01" : "1940-01-01";
        baseParams["vote_count.gte"] = this.exploreType === "movie" ? 5 : 2;
      }
      if (curType === "top_rated") {
        baseParams["vote_count.gte"] = Math.max(
          baseParams["vote_count.gte"] || 0,
          this.exploreType === "movie" ? 100 : 50,
        );
      }
    }
    try {
      let results = [];
      const isRandMode = Boolean(this.exploreRandomActive);
      if (!hasAnime) this.lastActiveAnime = false;
      if (hasAnime) {
        const isMovie = this.exploreType === "movie";
        let allowedAniIds = await this.resolveAniStudioStaffIds(
          aniStudioIds,
          aniStaffIds,
        );
        if (currentReqId !== this.exploreReqId) return;
        if (allowedAniIds !== null && allowedAniIds.length === 0) {
          this.exploreLoading = false;
          if (this.explorePage === 1)
            grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
          this.stopLoader();
          return;
        }
        const isAllTypesCombined =
          hasAnime && type === "all" && !isYearSortActive;
        const today = new Date();
        const todayInt =
          today.getFullYear() * 10000 +
          (today.getMonth() + 1) * 100 +
          today.getDate();
        const currentYrStr = String(currentYear);
        const includeAiring =
          !isMovie && (years.length === 0 || years.includes(currentYrStr));
        const perPage =
          allowedAniIds !== null || seasonIds.length > 0
            ? isMovie
              ? 45
              : 50
            : isMovie
              ? 20
              : 30;
        const subPerPage =
          allowedAniIds !== null
            ? 50
            : seasonIds.length > 0
              ? isMovie
                ? 20
                : 18
              : 12;
        let aniReqPage = this.explorePage;
        if (isRandMode) {
          if (
            !Array.isArray(this.exploreRandomAniPool) ||
            this.explorePage === 1 ||
            this.exploreRandomAniPool.length === 0
          ) {
            const hasNarrowAni =
              allowedAniIds !== null ||
              seasonIds.length > 0 ||
              years.length > 0 ||
              genre2Ids.length > 0 ||
              countries.length > 0 ||
              aniStudioIds.length > 0 ||
              aniStaffIds.length > 0;
            const maxAniPg = hasNarrowAni ? 3 : 8;
            this.exploreRandomAniPool = this.shuffleArray(
              Array.from({ length: maxAniPg }, (_, idx) => idx + 1),
            );
          }
          aniReqPage = this.exploreRandomAniPool.shift() || 1;
        }
        const { gqlVars } = this.buildAniExploreVars(
          fState,
          type,
          isYearSortActive,
          this.yearSortOrder,
          aniReqPage,
          isAllTypesCombined ? subPerPage : perPage,
        );
        if (allowedAniIds !== null) gqlVars.id_in = allowedAniIds;
        const aniFields =
          "id idMal format status episodes season seasonYear title { romaji english userPreferred } coverImage { extraLarge large } startDate { year month day } averageScore description countryOfOrigin genres studios(isMain: true) { nodes { name isAnimationStudio } } trailer { id site } relations { edges { relationType node { id format title { romaji english userPreferred } } } }";
        let gqlQuery;
        if (isAllTypesCombined) {
          delete gqlVars.sort;
          delete gqlVars.status_not_in;
          delete gqlVars.status;
          gqlVars.newest_lesser =
            gqlVars.startDate_lesser && gqlVars.startDate_lesser < todayInt
              ? gqlVars.startDate_lesser
              : todayInt;
          if (!gqlVars.startDate_greater) gqlVars.startDate_greater = 19000101;
          gqlQuery = this.buildAniExploreAllGql(
            aniFields,
            isMovie,
            includeAiring,
          );
        } else {
          gqlQuery = this.buildAniCatalogGql(aniFields, true);
        }
        const isCached = this.isAniCached(gqlQuery, gqlVars);
        let bottomLoader = grid ? grid.querySelector(".dots-loader") : null;
        if (!isCached || isRandMode) {
          if (this.explorePage > 1) {
            if (!bottomLoader) {
              bottomLoader = document.createElement("div");
              bottomLoader.className = "dots-loader";
              bottomLoader.style.gridColumn = "1 / -1";
              bottomLoader.style.minHeight = "0";
              bottomLoader.style.padding = "10px 0 16px";
              bottomLoader.innerHTML =
                '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
              grid.appendChild(bottomLoader);
            }
            await new Promise((r) => setTimeout(r, 3000));
            if (currentReqId !== this.exploreReqId) {
              if (bottomLoader && bottomLoader.parentNode)
                bottomLoader.remove();
              return;
            }
          } else if (this.lastActiveAnime || isRandMode) {
            grid.innerHTML = DOTS_HTML;
            await new Promise((r) => setTimeout(r, 3000));
            if (
              currentReqId !== this.exploreReqId ||
              (this.currentView !== "movies" &&
                this.currentView !== "shows" &&
                this.currentView !== "series" &&
                this.currentView !== "explore")
            ) {
              const strayL = grid ? grid.querySelector(".dots-loader") : null;
              if (strayL) strayL.remove();
              return;
            }
          }
        }
        this.lastActiveAnime = true;
        let aniRes = await this.aniApi(gqlQuery, gqlVars);
        if (currentReqId !== this.exploreReqId) {
          const bL = grid ? grid.querySelector(".dots-loader") : null;
          if (bL) bL.remove();
          return;
        }
        if (isRandMode && aniReqPage > 1) {
          const emptyCombined =
            isAllTypesCombined &&
            !(
              aniRes?.data?.pop?.media?.length ||
              aniRes?.data?.trend?.media?.length ||
              aniRes?.data?.newest?.media?.length ||
              aniRes?.data?.airing?.media?.length
            );
          const emptySingle =
            !isAllTypesCombined && !aniRes?.data?.Page?.media?.length;
          if (emptyCombined || emptySingle) {
            this.exploreRandomAniPool = (
              this.exploreRandomAniPool || []
            ).filter((p) => p < aniReqPage);
            if (this.explorePage === 1) {
              const p1Built = this.buildAniExploreVars(
                fState,
                type,
                isYearSortActive,
                this.yearSortOrder,
                1,
                isAllTypesCombined ? subPerPage : perPage,
              );
              const p1Vars = p1Built.gqlVars;
              if (allowedAniIds !== null) p1Vars.id_in = allowedAniIds;
              if (isAllTypesCombined) {
                delete p1Vars.sort;
                delete p1Vars.status_not_in;
                delete p1Vars.status;
                p1Vars.newest_lesser = gqlVars.newest_lesser;
                if (!p1Vars.startDate_greater)
                  p1Vars.startDate_greater = 19000101;
              }
              aniRes = await this.aniApi(gqlQuery, p1Vars);
              if (currentReqId !== this.exploreReqId) {
                const bL = grid ? grid.querySelector(".dots-loader") : null;
                if (bL) bL.remove();
                return;
              }
            }
          }
        }
        if (!aniRes || !aniRes.data) {
          if (this.explorePage > 1) {
            const bL = grid ? grid.querySelector(".dots-loader") : null;
            if (bL) bL.remove();
            this.explorePage--;
            this.exploreHasMore = true;
            this.exploreLoading = false;
            this.stopLoader();
            return;
          }
        }
        let mediaList = [];
        if (isAllTypesCombined) {
          const rawPop = aniRes?.data?.pop?.media || [];
          const rawTrend = aniRes?.data?.trend?.media || [];
          const rawNewest = aniRes?.data?.newest?.media || [];
          const rawAiring =
            !isMovie && includeAiring ? aniRes?.data?.airing?.media || [] : [];
          const buckets = isMovie
            ? [rawPop, rawTrend, rawNewest]
            : [rawPop, rawTrend, rawNewest, rawAiring];
          mediaList = this.zipInterleave(buckets);
          const pageInfos = [
            aniRes?.data?.pop?.pageInfo,
            aniRes?.data?.trend?.pageInfo,
            aniRes?.data?.newest?.pageInfo,
          ];
          if (!isMovie && includeAiring)
            pageInfos.push(aniRes?.data?.airing?.pageInfo);
          this.exploreHasMore = isRandMode
            ? this.exploreRandomAniPool.length > 0
            : pageInfos.some((pi) => pi?.hasNextPage === true);
        } else {
          mediaList = aniRes?.data?.Page?.media || [];
          this.exploreHasMore = isRandMode
            ? this.exploreRandomAniPool.length > 0
            : aniRes?.data?.Page?.pageInfo?.hasNextPage !== false;
        }
        if (seasonIds.length > 0) {
          mediaList = mediaList.filter((m) => {
            const s = this.resolveAnimeSeason(m);
            return s && seasonIds.includes(s);
          });
        }
        if (genre2Ids.length > 1) {
          mediaList = mediaList.filter((item) =>
            genre2Ids.every((g) => (item.genres || []).includes(g)),
          );
        }
        if (!this.exploreSeenTitles || this.explorePage === 1) {
          this.exploreSeenTitles = new Set();
        }
        results = [];
        mediaList.forEach((m) => {
          if (m.isAdult || (m.genres && m.genres.includes("Hentai"))) return;
          if (this.isUnreleasedAniMedia(m)) return;
          const startYr = m.startDate?.year;
          if (!startYr) return;
          if (startYr > currentYear + 1) return;
          const yStr = String(startYr);
          const syStr = m.seasonYear ? String(m.seasonYear) : "";
          if (
            years.length > 0 &&
            !years.includes(yStr) &&
            (!syStr || !years.includes(syStr))
          )
            return;
          if (isMovie) {
            const isRecap =
              (m.relations?.edges || []).some(
                (e) => e.relationType === "SUMMARY",
              ) ||
              /\b(?:recap|summary|compilation)\b/i.test(
                m.title?.english ||
                  m.title?.romaji ||
                  m.title?.userPreferred ||
                  "",
              );
            if (isRecap) return;
          } else {
            const tEng = this.normTitle(m.title?.english);
            const tRom = this.normTitle(m.title?.romaji);
            const tUser = this.normTitle(m.title?.userPreferred);
            if (
              (tEng && this.exploreSeenTitles.has(tEng)) ||
              (tRom && this.exploreSeenTitles.has(tRom)) ||
              (tUser && this.exploreSeenTitles.has(tUser))
            ) {
              return;
            }
            if (type !== "specials" && type !== "airing") {
              const rawTitles = [
                m.title?.english,
                m.title?.romaji,
                m.title?.userPreferred,
              ].filter(Boolean);
              if (rawTitles.some((rt) => this.isAnimeSeasonSequel(rt))) return;
              const mBases = rawTitles
                .map((rt) => this.normTitle(this.getAnimeBaseTitle(rt)))
                .filter(Boolean);
              const allowedSet = allowedAniIds ? new Set(allowedAniIds) : null;
              const isSequelOrSpinoff = (m.relations?.edges || []).some((e) => {
                if (!["TV", "TV_SHORT", "ONA"].includes(e.node?.format))
                  return false;
                if (e.relationType !== "PREQUEL" && e.relationType !== "PARENT")
                  return false;
                if (allowedSet) {
                  if (!allowedSet.has(e.node?.id)) return false;
                  const relTitles = [
                    e.node?.title?.english,
                    e.node?.title?.romaji,
                    e.node?.title?.userPreferred,
                  ].filter(Boolean);
                  const relBases = relTitles
                    .map((rt) => this.normTitle(this.getAnimeBaseTitle(rt)))
                    .filter(Boolean);
                  return relBases.some((rb) => mBases.includes(rb));
                }
                return true;
              });
              if (isSequelOrSpinoff) return;
              const hasSeenBase = rawTitles.some((rt) => {
                const base = this.normTitle(this.getAnimeBaseTitle(rt));
                return base && this.exploreSeenTitles.has(base);
              });
              if (hasSeenBase) return;
              rawTitles.forEach((rt) => {
                const b = this.normTitle(this.getAnimeBaseTitle(rt));
                if (b) this.exploreSeenTitles.add(b);
              });
            }
            if (tEng) this.exploreSeenTitles.add(tEng);
            if (tRom) this.exploreSeenTitles.add(tRom);
            if (tUser) this.exploreSeenTitles.add(tUser);
          }
          const aItem = this.toAniCard(m, isMovie);
          if (
            years.length > 0 &&
            years.includes(syStr) &&
            !years.includes(yStr)
          ) {
            aItem.year = syStr;
          }
          if (!this.cardItemCache) this.cardItemCache = {};
          this.lruSet(this.cardItemCache, aItem.id, aItem, "card");
          results.push(aItem);
        });
        if (countries.length > 1) {
          results = results.filter((i) => countries.includes(i.country));
        }
        if (isRandMode) {
          this.shuffleArray(results);
        }
        if (
          results.length === 0 &&
          this.exploreHasMore &&
          this.explorePage < 50 &&
          (!isRandMode || this.exploreRandomAniPool.length > 0)
        ) {
          this.explorePage++;
          this.exploreLoading = false;
          return this.loadExplore();
        }
      } else {
        let normalBottomLoader = null;
        if (isRandMode) {
          if (this.explorePage === 1) {
            grid.innerHTML = DOTS_HTML;
          } else {
            const oldL = grid.querySelector(".dots-loader");
            if (oldL) oldL.remove();
            normalBottomLoader = document.createElement("div");
            normalBottomLoader.className = "dots-loader";
            normalBottomLoader.style.gridColumn = "1 / -1";
            normalBottomLoader.style.minHeight = "0";
            normalBottomLoader.style.padding = "10px 0 16px";
            normalBottomLoader.innerHTML =
              '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            grid.appendChild(normalBottomLoader);
          }
        }
        const randBufferPromise = isRandMode
          ? new Promise((r) => setTimeout(r, 1000))
          : Promise.resolve();
        if (
          (this.exploreType === "tv" || this.exploreType === "movie") &&
          personIds.length > 0
        ) {
          if (
            isRandMode &&
            Array.isArray(this.exploreRandomPersonList) &&
            this.explorePage > 1
          ) {
            results = this.exploreRandomPersonList.slice(
              (this.explorePage - 1) * 20,
              this.explorePage * 20,
            );
          } else {
            const isTv = this.exploreType === "tv";
            const credEndpoint = isTv ? "tv_credits" : "movie_credits";
            const creditsArr = await Promise.all(
              personIds.map((pId) =>
                this.api(`/person/${pId}/${credEndpoint}`),
              ),
            );
            if (currentReqId !== this.exploreReqId) {
              if (normalBottomLoader && normalBottomLoader.parentNode)
                normalBottomLoader.remove();
              return;
            }
            const role = this.personRoleFilter;
            let list = [];
            creditsArr.forEach((cData) => {
              if (!cData) return;
              let castList = cData.cast || [];
              if (role === "main") {
                castList = castList.filter((i) =>
                  isTv
                    ? (i.episode_count || 0) >= 10
                    : i.order !== undefined && i.order <= 9,
                );
              } else if (role === "other") {
                castList = castList.filter((i) =>
                  isTv
                    ? (i.episode_count || 0) <= 9
                    : i.order !== undefined && i.order >= 10,
                );
              }
              list.push(...castList);
              if (!role) {
                list.push(...(cData.crew || []));
              }
            });
            if (personIds.length > 1) {
              const idSets = creditsArr.map((cData) => {
                const s = new Set();
                (cData?.cast || []).forEach((i) => i?.id && s.add(i.id));
                (cData?.crew || []).forEach((i) => i?.id && s.add(i.id));
                return s;
              });
              list = list.filter((i) => idSets.every((s) => s.has(i.id)));
            }
            const seen = new Set();
            list = list.filter((i) => {
              if (
                !i ||
                !i.id ||
                seen.has(i.id) ||
                this.isBlocked(i, this.exploreType)
              )
                return false;
              seen.add(i.id);
              return true;
            });
            if (normalGenreIds.length > 0) {
              const gInts = normalGenreIds.map((g) => parseInt(g, 10));
              list = list.filter(
                (i) =>
                  gInts.every((gid) => (i.genre_ids || []).includes(gid)) &&
                  !this.isAnimeItem(i),
              );
            }
            const dField = isTv ? "first_air_date" : "release_date";
            if (years.length > 0) {
              list = list.filter((i) =>
                years.some((y) => (i[dField] || "").startsWith(y)),
              );
            }
            if (countries.length > 0 && isTv) {
              list = list.filter((i) =>
                (i.origin_country || []).some((ctry) =>
                  countries.includes(ctry),
                ),
              );
            }
            if (isRandMode) {
              this.shuffleArray(list);
              this.exploreRandomPersonList = list;
            } else if (isYearSortActive) {
              this.sortMediaByYear(list, this.yearSortOrder || "desc", dField);
            } else if (type === "top_rated")
              list.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
            else if (type === "newest")
              list.sort((a, b) =>
                (b[dField] || "").localeCompare(a[dField] || ""),
              );
            else list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            results = list.slice(
              (this.explorePage - 1) * 20,
              this.explorePage * 20,
            );
          }
        } else {
          let reqPage = this.explorePage;
          let preFetchedRes = null;
          if (isRandMode) {
            if (
              !Array.isArray(this.exploreRandomPool) ||
              this.explorePage === 1 ||
              this.exploreRandomPool.length === 0
            ) {
              const probeParams =
                isYearSortActive && type === "all"
                  ? { ...baseParams, page: 1 }
                  : type === "all"
                    ? this.buildTmdbTypeParams("popular", baseParams, 1)
                    : isYearSortActive
                      ? { ...baseParams, page: 1 }
                      : this.buildTmdbTypeParams(type, baseParams, 1);
              preFetchedRes = await this.api(
                `/discover/${this.exploreType}`,
                probeParams,
              ).catch(() => null);
              if (currentReqId !== this.exploreReqId) {
                if (normalBottomLoader && normalBottomLoader.parentNode)
                  normalBottomLoader.remove();
                return;
              }
              const maxPg = Math.max(
                1,
                Math.min(preFetchedRes?.total_pages || 1, 35),
              );
              this.exploreRandomPool = this.shuffleArray(
                Array.from({ length: maxPg }, (_, idx) => idx + 1),
              );
            }
            reqPage = this.exploreRandomPool.shift() || 1;
          }
          if (isYearSortActive && type === "all") {
            const res =
              reqPage === 1 && preFetchedRes
                ? preFetchedRes
                : await this.api(`/discover/${this.exploreType}`, {
                    ...baseParams,
                    page: reqPage,
                  });
            if (currentReqId !== this.exploreReqId) {
              if (normalBottomLoader && normalBottomLoader.parentNode)
                normalBottomLoader.remove();
              return;
            }
            results = (res && res.results) || [];
          } else if (type === "all") {
            const types = [
              "popular",
              "trending",
              "newest",
              this.exploreType === "movie" ? "revenue" : "airing",
              "top_rated",
            ];
            const queries = types.map((k, kIdx) =>
              reqPage === 1 && kIdx === 0 && preFetchedRes
                ? Promise.resolve(preFetchedRes)
                : this.api(
                    `/discover/${this.exploreType}`,
                    this.buildTmdbTypeParams(k, baseParams, reqPage),
                  ),
            );
            const responses = await Promise.all(queries);
            if (currentReqId !== this.exploreReqId) {
              if (normalBottomLoader && normalBottomLoader.parentNode)
                normalBottomLoader.remove();
              return;
            }
            const lists = responses.map((r) => (r && r.results) || []);
            results = this.zipInterleave(lists);
          } else {
            const params = isYearSortActive
              ? { ...baseParams, page: reqPage }
              : this.buildTmdbTypeParams(type, baseParams, reqPage);
            const data =
              reqPage === 1 && preFetchedRes
                ? preFetchedRes
                : await this.api(`/discover/${this.exploreType}`, params);
            if (currentReqId !== this.exploreReqId) {
              if (normalBottomLoader && normalBottomLoader.parentNode)
                normalBottomLoader.remove();
              return;
            }
            results = (data && data.results) || [];
          }
          if (isRandMode && this.exploreRandomPool.length === 0) {
            this.exploreHasMore = false;
          }
        }
        if (isRandMode) {
          await randBufferPromise;
          if (
            currentReqId !== this.exploreReqId ||
            (this.currentView !== "movies" &&
              this.currentView !== "shows" &&
              this.currentView !== "series" &&
              this.currentView !== "explore")
          ) {
            if (normalBottomLoader && normalBottomLoader.parentNode)
              normalBottomLoader.remove();
            else {
              const strayL = grid ? grid.querySelector(".dots-loader") : null;
              if (strayL) strayL.remove();
            }
            return;
          }
          this.shuffleArray(results);
        }
      }
      if (currentReqId !== this.exploreReqId) return;
      if (!hasAnime && normalGenreIds.length > 0)
        results = results.filter((i) => !this.isAnimeItem(i));
      if (years.length > 1)
        results = results.filter((i) => years.includes(this.getItemYear(i)));
      if (this.exploreType === "movie" && countries.length > 0) {
        if (countries.length === 1) {
          results.forEach((i) => {
            if (
              !i.country &&
              (!i.origin_country || i.origin_country.length === 0)
            )
              i.country = countries[0];
          });
        } else {
          results.forEach((i) => {
            if (!i.country) {
              const code = this.getCountryCode(i);
              if (countries.includes(code)) i.country = code;
            }
          });
        }
      }
      this.exploreLoading = false;
      if (results.length > 0) {
        const unique = results.filter((i) => {
          if (
            !i ||
            !i.id ||
            this.exploreSeenIds.has(String(i.id)) ||
            this.isBlocked(i, this.exploreType)
          )
            return false;
          this.exploreSeenIds.add(String(i.id));
          return true;
        });
        if (isRandMode) this.shuffleArray(unique);
        if (hasAnime && typeof this.enrichAnimeTmdbPosters === "function") {
          this.exploreLoading = true;
          await this.enrichAnimeTmdbPosters(unique);
          if (currentReqId !== this.exploreReqId) return;
        }
        const html = unique
          .map((i) => this.buildCard(i, this.exploreType))
          .join("");
        this.appendExploreGridHtml(
          grid,
          html,
          this.explorePage === 1 || !grid.querySelector(".poster-card"),
        );
      } else {
        const bLoader = grid ? grid.querySelector(".dots-loader") : null;
        if (bLoader) bLoader.remove();
        this.exploreHasMore = false;
        if (this.explorePage === 1 && !grid.querySelector(".poster-card"))
          grid.innerHTML = '<div class="msg-box">Nothing to show.</div>';
      }
    } catch (err) {
      if (currentReqId === this.exploreReqId) {
        const bLoader = grid ? grid.querySelector(".dots-loader") : null;
        if (bLoader) bLoader.remove();
        this.exploreLoading = false;
        if (
          this.explorePage === 1 ||
          !this.exploreSeenIds ||
          this.exploreSeenIds.size === 0
        )
          grid.innerHTML = '<div class="msg-box">Error loading content.</div>';
      }
    }
    if (currentReqId === this.exploreReqId) {
      this.exploreLoading = false;
      this.stopLoader();
    }
  },
  async openShowinfo(
    id,
    type,
    pushState = true,
    replaceState = false,
    scrollToEpisodes = false,
    showOverlay = false,
  ) {
    this.castViewMode = "min";
    if (this.uiPrefs) delete this.uiPrefs.castViewMode;
    this.updateCastTitleUI();
    if (pushState) this.blockWatchOnBack = false;
    document.body.classList.remove("explore-hub-open", "mylist-hub-open");
    document.documentElement.classList.remove(
      "explore-hub-open",
      "mylist-hub-open",
    );
    if (
      this.currentView === "movies" ||
      this.currentView === "shows" ||
      this.currentView === "series" ||
      (this.currentView === "explore" &&
        this.$g("explore-catalog")?.style.display !== "none")
    ) {
      const curT =
        this.exploreType ||
        (this.currentView === "shows" || this.currentView === "series"
          ? "tv"
          : "movie");
      if (!this.exploreScrollPos) this.exploreScrollPos = {};
      this.exploreScrollPos[curT] = this.getScrollY();
      this.returnFromShowinfoToExplore = true;
    } else if (
      this.currentView !== "showinfo" &&
      this.currentView !== "watch"
    ) {
      this.returnFromShowinfoToExplore = false;
    }
    this.captureLeavingViewState("showinfo");
    this.setActiveView("showinfo", null);
    window.scrollTo(0, 0);
    this.currentView = "showinfo";
    this.updateBackBtn("showinfo");
    this.resetPlayerIframe();
    this.applySeasonViewMode();
    if (this.siSeasonScrollTimer) {
      clearTimeout(this.siSeasonScrollTimer);
      this.siSeasonScrollTimer = null;
    }
    if (this.siAnchorScrollTimer) {
      clearTimeout(this.siAnchorScrollTimer);
      this.siAnchorScrollTimer = null;
    }
    if (this.siAnchorScrollTimer2) {
      clearTimeout(this.siAnchorScrollTimer2);
      this.siAnchorScrollTimer2 = null;
    }
    this.pendingSeasonAnchorScroll = false;
    this._needsSeasonAnchorAlign = false;
    this.pendingScrollToEpisode = false;
    this.pendingScrollToEpTop = false;
    if (!scrollToEpisodes) {
      this.showSiScrollOverlay(false);
      if (!this.currentShow || String(this.currentShow.id) !== String(id)) {
        this.siSeasonScrollY =
          (this.showSeasonScrollY && this.showSeasonScrollY[id]) || 0;
      }
    }
    this.$display(
      [
        "si-seasons-section",
        "si-back-to-seasons",
        "si-episodes-section",
        "si-ep-pagination",
        "si-play-wrap",
        "si-play-btn",
        "si-media-btn",
        "si-media-section",
        "si-trailer-btn",
        "si-trailer-wrap",
        "si-bookmark-btn",
        "si-watched-btn",
        "si-block-btn",
        "si-cast-section",
        "si-similar-section",
        "si-lower-loader",
      ],
      "none",
    );
    const initialMediaSec = this.$g("si-media-section");
    if (initialMediaSec) {
      initialMediaSec.classList.remove("slide-down", "is-collapsing");
      initialMediaSec.style.height = "";
      initialMediaSec.style.overflow = "";
      initialMediaSec.style.pointerEvents = "";
      initialMediaSec.style.transition = "";
      if (this._mediaEndHandler) {
        initialMediaSec.removeEventListener(
          "transitionend",
          this._mediaEndHandler,
        );
        this._mediaEndHandler = null;
      }
    }
    clearTimeout(this._mediaAnimTimer);
    this.$clear([
      "si-seasons-grid",
      "si-ep-grid",
      "si-ep-pagination",
      "si-cast-row",
      "si-media-grid",
      "si-similar-row",
      "si-title",
      "si-desc",
      "si-extra-meta",
      "si-meta",
    ]);
    this.$display(["si-initial-loader"], "flex");
    this.setEpHeading("Episodes");
    this.currentEpisodes = [];
    this.currentOmdbEpisodes = {};
    this.currentAnimeInfo = null;
    this.currentShowSeasonList = null;
    const mediaBtn = this.$g("si-media-btn");
    if (mediaBtn) mediaBtn.innerHTML = `${GALLERY_BTN_SVG(17, 17)} Gallery`;
    this.closeMediaLightbox();
    this.movieMediaState = {
      active: false,
      items: [],
      page: 0,
      id: null,
    };
    const simSec = this.$g("si-similar-section");
    if (simSec) simSec.style.marginTop = "";
    clearInterval(this.siHeroTimer);
    const currentShowinfoReqId = ++this.siReqId;
    const trailerBtn = this.$g("si-trailer-btn");
    const trailerWrap = this.$g("si-trailer-wrap");
    const watchedBtn = this.$g("si-watched-btn");
    const hist = this.getHistory();
    const showInHist = hist.find((x) => String(x.id) === String(id));
    const siHero = this.$g("si-hero");
    const siBg = this.$g("si-bg");
    const siBlur = this.$g("si-blur-bg");
    if (siHero) {
      siHero.style.backgroundImage = "none";
      siHero.style.opacity = "0";
    }
    if (siBg) {
      siBg.style.backgroundImage = "none";
      siBg.style.opacity = "0";
    }
    if (siBlur) {
      siBlur.style.backgroundImage = "none";
      siBlur.style.opacity = "0";
    }
    const siPoster = this.$g("si-poster");
    const siPosterWrap = this.$g("si-poster-wrap");
    siPoster.classList.remove("loaded");
    if (siPosterWrap) siPosterWrap.classList.remove("loaded");
    siPoster.src =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=";
    const castSecInit = this.$g("si-cast-section");
    if (castSecInit) castSecInit.style.display = "none";
    const castRowInit = this.$g("si-cast-row");
    if (castRowInit) {
      castRowInit.scrollLeft = 0;
      castRowInit.innerHTML = "";
    }
    const simSecInit = this.$g("si-similar-section");
    if (simSecInit) {
      simSecInit.style.marginTop = "";
      simSecInit.style.display = "none";
    }
    const simRowInit = this.$g("si-similar-row");
    if (simRowInit) {
      simRowInit.scrollLeft = 0;
      simRowInit.innerHTML = "";
      if (typeof this.checkScrollArrow === "function")
        this.checkScrollArrow(simRowInit);
    }
    try {
      let resolvedId = id;
      let resolvedType = type;
      const showCacheKey = `${type}_${id}`;
      if (!this.showDetailsCache) this.showDetailsCache = {};
      let cachedShow =
        this.getShowDetailsCache(showCacheKey) ||
        this.getShowDetailsCache(id) ||
        null;
      if (
        cachedShow &&
        typeof id === "string" &&
        id.startsWith("ani_") &&
        String(cachedShow.resolvedId).startsWith("ani_")
      ) {
        if (!cachedShow.data?._noTmdb) cachedShow = null;
      }
      let data = cachedShow?.data || null;
      let anilistMedia = cachedShow?.anilistMedia || null;
      if (cachedShow) {
        resolvedId = cachedShow.resolvedId;
        resolvedType = cachedShow.resolvedType;
      }
      if (!data) {
        if (typeof id === "string" && id.startsWith("tt")) {
          const fRes = await this.api(`/find/${id}`, {
            external_source: "imdb_id",
          });
          const fItem =
            (fRes.movie_results && fRes.movie_results[0]) ||
            (fRes.tv_results && fRes.tv_results[0]);
          if (fItem && fItem.id) {
            resolvedId = fItem.id;
            resolvedType = fItem.title ? "movie" : "tv";
          }
        }
        if (typeof id === "string" && id.startsWith("ani_")) {
          const aniNum = parseInt(id.replace("ani_", ""), 10);
          const pre =
            this.animeCache?.[`ani_${aniNum}`] || this.animeCache?.[String(id)];
          const cardItem =
            (this.cardItemCache && this.cardItemCache[String(id)]) || null;
          const knownFmt =
            pre?.animeFormat || cardItem?.animeFormat || cardItem?.type || "";
          const makeFallbackAniMedia = (overrides = {}) =>
            Object.assign(
              {
                id: aniNum,
                idMal: aniNum,
                format: "TV",
                season: null,
                seasonYear: null,
                studios: { nodes: [] },
                title: { romaji: "", english: "", userPreferred: "" },
                bannerImage: null,
                coverImage: { extraLarge: "", large: "" },
                description: "",
                episodes: 1,
                duration: 24,
                averageScore: 0,
                status: "Finished",
                startDate: { year: null },
                genres: [],
                countryOfOrigin: "JP",
                trailer: null,
                relations: { edges: [] },
              },
              overrides,
            );
          const hasKnownRelations = Boolean(
            pre?.relations?.edges?.length || cardItem?.relations?.edges?.length,
          );
          const isMainstream =
            ["TV", "MOVIE", "movie"].includes(knownFmt) ||
            (["TV_SHORT", "ONA", "Scripted"].includes(knownFmt) &&
              hasKnownRelations);
          if (isMainstream) {
            anilistMedia = makeFallbackAniMedia({
              idMal: pre?.malId || cardItem?.mal_id || aniNum,
              format:
                pre?.animeFormat ||
                cardItem?.animeFormat ||
                (cardItem?.media_type === "movie" || cardItem?.type === "movie"
                  ? "MOVIE"
                  : "TV"),
              season: pre?.season || cardItem?.season || null,
              seasonYear:
                pre?.seasonYear ||
                (cardItem?.year ? parseInt(cardItem.year, 10) : null),
              studios: {
                nodes: (pre?.studios || cardItem?.studios || []).map(
                  (name) => ({ name, isAnimationStudio: true }),
                ),
              },
              title: {
                romaji:
                  pre?.romaji || cardItem?.romaji || cardItem?.title || "",
                english: cardItem?.title || "",
                userPreferred: cardItem?.title || "",
              },
              bannerImage: cardItem?.backdrop_path || null,
              coverImage: {
                extraLarge: cardItem?.poster_path || "",
                large: cardItem?.poster_path || "",
              },
              description: cardItem?.overview || "",
              startDate: {
                year:
                  pre?.seasonYear ||
                  (cardItem?.year ? parseInt(cardItem.year, 10) : null),
              },
              genres: pre?.genres?.length ? pre.genres : cardItem?.genres || [],
              trailer: pre?.trailer || cardItem?.trailer || null,
              relations: pre?.relations || cardItem?.relations || { edges: [] },
            });
          } else {
            try {
              const aRes = await this.aniApi(this.ANI_MEDIA_QUERY, {
                id: aniNum,
              });
              anilistMedia = aRes?.data?.Media;
            } catch (e) {}
          }
          if (!anilistMedia) {
            const cardItem =
              (this.cardItemCache && this.cardItemCache[String(id)]) || null;
            const fallbackMalId = cardItem?.mal_id || null;
            const fallbackTitle = cardItem?.title || cardItem?.name || null;
            if (fallbackMalId) {
              try {
                const jRes = await fetch(
                  `https://api.jikan.moe/v4/anime/${fallbackMalId}`,
                )
                  .then((r) => r.json())
                  .catch(() => null);
                const jData = jRes?.data;
                if (jData) {
                  const jYear =
                    jData.year ||
                    (jData.aired?.from
                      ? parseInt(jData.aired.from.substring(0, 4), 10)
                      : null);
                  anilistMedia = makeFallbackAniMedia({
                    idMal: jData.mal_id,
                    format: jData.type,
                    seasonYear: jYear,
                    studios: {
                      nodes: (jData.studios || []).map((s) => ({
                        name: s.name,
                        isAnimationStudio: true,
                      })),
                    },
                    title: {
                      romaji: jData.title,
                      english: jData.title_english,
                      userPreferred: jData.title,
                    },
                    coverImage: {
                      extraLarge:
                        jData.images?.jpg?.large_image_url ||
                        cardItem?.poster_path,
                      large:
                        jData.images?.jpg?.image_url || cardItem?.poster_path,
                    },
                    description: jData.synopsis || cardItem?.overview || "",
                    episodes: jData.episodes || 1,
                    duration: jData.duration
                      ? parseInt(jData.duration, 10)
                      : 24,
                    averageScore: jData.score
                      ? Math.round(jData.score * 10)
                      : cardItem?.vote_average
                        ? Math.round(cardItem.vote_average * 10)
                        : 0,
                    status: jData.status || "Finished",
                    startDate: { year: jYear },
                    genres: (jData.genres || []).map((g) => g.name),
                    trailer: { id: jData.trailer?.youtube_id, site: "youtube" },
                  });
                }
              } catch (e) {}
            }
            if (!anilistMedia && fallbackTitle) {
              try {
                const kRes = await fetch(
                  `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(fallbackTitle)}&page[limit]=1`,
                )
                  .then((r) => r.json())
                  .catch(() => null);
                const kAttr = kRes?.data?.[0]?.attributes;
                if (kAttr) {
                  const kYear = kAttr.startDate
                    ? parseInt(kAttr.startDate.substring(0, 4), 10)
                    : null;
                  anilistMedia = makeFallbackAniMedia({
                    idMal: fallbackMalId || aniNum,
                    format: (kAttr.subtype || "TV").toUpperCase(),
                    seasonYear: kYear,
                    title: {
                      romaji: kAttr.canonicalTitle,
                      english: kAttr.titles?.en || kAttr.canonicalTitle,
                      userPreferred: kAttr.canonicalTitle,
                    },
                    bannerImage: kAttr.coverImage?.original || null,
                    coverImage: {
                      extraLarge:
                        kAttr.posterImage?.original || cardItem?.poster_path,
                      large: kAttr.posterImage?.large || cardItem?.poster_path,
                    },
                    description: kAttr.synopsis || cardItem?.overview || "",
                    episodes: kAttr.episodeCount || 1,
                    duration: kAttr.episodeLength || 24,
                    averageScore: kAttr.averageRating
                      ? Math.round(parseFloat(kAttr.averageRating))
                      : 0,
                    status:
                      kAttr.status === "current" ? "Releasing" : "Finished",
                    startDate: { year: kYear },
                    genres: cardItem?.genres || [],
                    trailer: { id: kAttr.youtubeVideoId, site: "youtube" },
                  });
                }
              } catch (e) {}
            }
            if (
              !anilistMedia &&
              cardItem &&
              (cardItem.title || cardItem.name)
            ) {
              const cTitle = cardItem.title || cardItem.name;
              const cYear = parseInt(cardItem.year, 10) || null;
              anilistMedia = makeFallbackAniMedia({
                idMal: cardItem.mal_id || aniNum,
                format: type === "movie" ? "MOVIE" : "TV",
                seasonYear: cYear,
                title: {
                  romaji: cTitle,
                  english: cTitle,
                  userPreferred: cTitle,
                },
                coverImage: {
                  extraLarge: cardItem.poster_path,
                  large: cardItem.poster_path,
                },
                description: cardItem.overview || "",
                averageScore: cardItem.vote_average
                  ? Math.round(cardItem.vote_average * 10)
                  : 0,
                startDate: { year: cYear },
                genres: cardItem.genres || [],
                countryOfOrigin: cardItem.country || "JP",
              });
            }
          }
          if (anilistMedia) {
            let foundTmdb = null;
            let matchedViaParent = false;
            const relEdges = anilistMedia.relations?.edges || [];
            const hasParentRelation = relEdges.some(
              (e) => e.relationType === "PARENT",
            );
            const isOvaOrSpecial =
              ["OVA", "SPECIAL"].includes(anilistMedia.format) ||
              ["OVA", "Special"].includes(cardItem?.type);
            const isShortOrSpinoff =
              isOvaOrSpecial ||
              anilistMedia.format === "TV_SHORT" ||
              (anilistMedia.duration && anilistMedia.duration <= 15) ||
              hasParentRelation;
            const cleanAnimeTitle = (s) =>
              (s || "")
                .replace(
                  /\s*[:\-–—~]?\s*\((?:tv|tv\s+series|ona|ova|special|specials|web)\)\s*$/i,
                  "",
                )
                .replace(/\s*\b(?:tv|ona|ova)\b\s*$/i, "")
                .trim();
            const norm = (s) =>
              cleanAnimeTitle(s)
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
            const getBase = (s) =>
              cleanAnimeTitle(s)
                .split(/[:\-–—~]/)[0]
                .replace(
                  /\b(?:season\s*\d+|\d+(?:st|nd|rd|th)\s+season|part\s*\d+|cour\s*\d+|new\s+world|stone\s+wars|eternal\s+summer|dive\s+to\s+the\s+future|thousand\s*year\s*blood\s*war).*$/i,
                  "",
                )
                .trim();
            const rawSearchTitle =
              anilistMedia.title?.english ||
              anilistMedia.title?.romaji ||
              anilistMedia.title?.userPreferred;
            const searchTitle =
              cleanAnimeTitle(rawSearchTitle) || rawSearchTitle;
            if (searchTitle) {
              try {
                const rawTitles = [
                  anilistMedia.title?.english,
                  anilistMedia.title?.romaji,
                  anilistMedia.title?.userPreferred,
                  cleanAnimeTitle(anilistMedia.title?.english),
                  cleanAnimeTitle(anilistMedia.title?.romaji),
                  cleanAnimeTitle(anilistMedia.title?.userPreferred),
                ].filter(Boolean);
                const tNorms = [
                  ...new Set(rawTitles.map(norm).filter(Boolean)),
                ];
                const baseTitles = [
                  ...new Set(
                    rawTitles.map(getBase).filter((b) => b && b.length >= 2),
                  ),
                ];
                const baseNorms = [
                  ...new Set(baseTitles.map(norm).filter(Boolean)),
                ];
                const aYr = anilistMedia.startDate?.year;
                const pickBestHit = (hits, allowParent = false) => {
                  const animeHits = (hits || []).filter((h) => {
                    if (this.isAnimeItem(h)) return true;
                    if (anilistMedia) {
                      const hLang = h.original_language || "";
                      const hOc = h.origin_country || [];
                      const isJp =
                        hLang === "ja" ||
                        hOc.includes("JP") ||
                        this.hasCountryOrigin(h, "JP", "Japan", "ja");
                      if (isJp) {
                        const hName = norm(h.title || h.name);
                        const hOrig = norm(h.original_title || h.original_name);
                        const nameMatches =
                          tNorms.includes(hName) ||
                          tNorms.includes(hOrig) ||
                          (anilistMedia.title?.native &&
                            (h.original_title === anilistMedia.title.native ||
                              h.original_name === anilistMedia.title.native));
                        const hYr = parseInt(this.getItemYear(h), 10);
                        if (
                          nameMatches &&
                          (!aYr || !hYr || Math.abs(hYr - aYr) <= 2)
                        )
                          return true;
                      }
                    }
                    return false;
                  });
                  const exact = animeHits.filter((h) => {
                    if (
                      isOvaOrSpecial &&
                      (h.media_type === "tv" || (!h.title && h.name))
                    )
                      return false;
                    const hName = norm(h.title || h.name);
                    const hOrig = norm(h.original_title || h.original_name);
                    const isNativeMatch = Boolean(
                      anilistMedia?.title?.native &&
                      (h.original_name === anilistMedia.title.native ||
                        h.original_title === anilistMedia.title.native),
                    );
                    if (
                      isNativeMatch ||
                      tNorms.includes(hName) ||
                      tNorms.includes(hOrig)
                    )
                      return true;
                    if (!isShortOrSpinoff) {
                      const parts = (h.title || h.name || "")
                        .split(/[:\-–—~]/)
                        .map(norm)
                        .filter(Boolean);
                      if (parts.some((p) => tNorms.includes(p))) return true;
                    }
                    return false;
                  });
                  if (exact.length > 0) {
                    if (aYr) {
                      const yrHit = exact.find((h) => {
                        const hYr = parseInt(this.getItemYear(h), 10);
                        if (!hYr) return false;
                        return Math.abs(hYr - aYr) <= 2;
                      });
                      if (yrHit) return { hit: yrHit, isParent: false };
                      const natHit = exact.find(
                        (h) =>
                          anilistMedia.title?.native &&
                          (h.original_name === anilistMedia.title.native ||
                            h.original_title === anilistMedia.title.native),
                      );
                      if (natHit) return { hit: natHit, isParent: false };
                    } else {
                      return { hit: exact[0], isParent: false };
                    }
                  }
                  if (!allowParent || resolvedType !== "tv") return null;
                  const parentHits = animeHits.filter((h) => {
                    const hN = norm(h.title || h.name);
                    const hBase = norm(getBase(h.title || h.name));
                    const hOn = norm(h.original_title || h.original_name);
                    const isNativeMatch = Boolean(
                      anilistMedia?.title?.native &&
                      (h.original_name === anilistMedia.title.native ||
                        h.original_title === anilistMedia.title.native),
                    );
                    const matchesName =
                      hN &&
                      (baseNorms.includes(hN) ||
                        baseNorms.includes(hBase) ||
                        (hN.length >= 4 &&
                          tNorms.some(
                            (tn) => tn.startsWith(hN) || tn.endsWith(hN),
                          )) ||
                        tNorms.some(
                          (tn) =>
                            tn.length >= 4 &&
                            (hN.startsWith(tn) ||
                              hN.endsWith(tn) ||
                              hBase === tn),
                        ));
                    const matchesOrig =
                      (hOn &&
                        (baseNorms.includes(hOn) ||
                          (hOn.length >= 4 &&
                            tNorms.some(
                              (tn) => tn.startsWith(hOn) || tn.endsWith(hOn),
                            )) ||
                          tNorms.some(
                            (tn) =>
                              tn.length >= 4 &&
                              (hOn.startsWith(tn) || hOn.endsWith(tn)),
                          ))) ||
                      isNativeMatch;
                    return matchesName || matchesOrig;
                  });
                  if (parentHits.length > 0) {
                    if (aYr) {
                      const yrHit = parentHits.find((h) => {
                        const hYr = parseInt(this.getItemYear(h), 10);
                        return hYr && hYr <= aYr;
                      });
                      if (yrHit) return { hit: yrHit, isParent: true };
                    }
                    return { hit: parentHits[0], isParent: true };
                  }
                  return null;
                };
                const sRes = await this.api(
                  `/search/${resolvedType}`,
                  { query: searchTitle },
                  this.getTmdbAnimeKey(),
                );
                let picked = pickBestHit(sRes?.results, !isShortOrSpinoff);
                if (!picked) {
                  for (const altTitle of rawTitles) {
                    if (norm(altTitle) === norm(searchTitle)) continue;
                    const altRes = await this.api(
                      `/search/${resolvedType}`,
                      { query: altTitle },
                      this.getTmdbAnimeKey(),
                    );
                    picked = pickBestHit(altRes?.results, !isShortOrSpinoff);
                    if (picked) break;
                  }
                }
                if (!picked && anilistMedia?.title?.native) {
                  const natRes = await this.api(
                    `/search/${resolvedType}`,
                    { query: anilistMedia.title.native },
                    this.getTmdbAnimeKey(),
                  );
                  picked = pickBestHit(natRes?.results, !isShortOrSpinoff);
                }
                if (!picked && resolvedType === "tv" && !isShortOrSpinoff) {
                  for (const bTitle of baseTitles) {
                    if (norm(bTitle) === norm(searchTitle)) continue;
                    const bRes = await this.api(
                      `/search/tv`,
                      { query: bTitle },
                      this.getTmdbAnimeKey(),
                    );
                    picked = pickBestHit(bRes?.results, true);
                    if (picked) break;
                  }
                }
                if (!picked && resolvedType === "tv" && !isShortOrSpinoff) {
                  if (!anilistMedia.relations?.edges?.length) {
                    const fullAni = await this.aniApi(this.ANI_MEDIA_QUERY, {
                      id: aniNum,
                    });
                    if (fullAni?.data?.Media) anilistMedia = fullAni.data.Media;
                  }
                  const preEdge = (anilistMedia.relations?.edges || []).find(
                    (e) => e.relationType === "PREQUEL" && e.node?.title,
                  );
                  const preTitle =
                    preEdge?.node?.title?.english ||
                    preEdge?.node?.title?.romaji ||
                    preEdge?.node?.title?.userPreferred;
                  if (preTitle) {
                    const pBase = getBase(preTitle) || preTitle;
                    const pRes = await this.api(
                      `/search/tv`,
                      { query: pBase },
                      this.getTmdbAnimeKey(),
                    );
                    const pNorm = norm(pBase);
                    const pHit = (pRes?.results || []).find(
                      (h) =>
                        this.isAnimeItem(h) &&
                        (norm(h.title || h.name) === pNorm ||
                          norm(h.original_title || h.original_name) === pNorm ||
                          (norm(h.title || h.name).length >= 4 &&
                            pNorm.startsWith(norm(h.title || h.name)))),
                    );
                    if (pHit) picked = { hit: pHit, isParent: true };
                  }
                }
                if (picked && picked.hit?.id) {
                  const tData = await this.api(
                    `/${resolvedType}/${picked.hit.id}`,
                    {
                      append_to_response:
                        "credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers",
                      include_image_language: "en,null",
                      include_video_language: "en,null",
                    },
                    this.getTmdbAnimeKey(),
                  );
                  if (
                    tData &&
                    tData.id &&
                    (resolvedType !== "tv" ||
                      (tData.seasons && tData.seasons.length > 0))
                  ) {
                    foundTmdb = tData;
                    matchedViaParent = picked.isParent;
                  }
                }
              } catch (e) {}
            }
            if (foundTmdb) {
              data = foundTmdb;
              if (anilistMedia.genres?.length) {
                const animGenre = (foundTmdb.genres || []).find(
                  (g) =>
                    g.id === 16 ||
                    (g.name && g.name.toLowerCase() === "animation"),
                ) || { id: 16, name: "Animation" };
                const aniGList = anilistMedia.genres
                  .filter((g) => g.toLowerCase() !== "animation")
                  .map((g) => ({ id: g, name: g }));
                data.genres = [animGenre, ...aniGList];
                data.ani_genres = anilistMedia.genres;
              }
              if (matchedViaParent) {
                anilistMedia = null;
              } else {
                data.ani_id = anilistMedia.id;
                data.mal_id = anilistMedia.idMal || anilistMedia.id;
                if (!this.animeCache) this.animeCache = {};
                if (!this.animeCache["ani_" + anilistMedia.id])
                  this.animeCache["ani_" + anilistMedia.id] = {};
                this.animeCache["ani_" + anilistMedia.id].tmdbId = foundTmdb.id;
                if (!this.animeCache[foundTmdb.id])
                  this.animeCache[foundTmdb.id] = {};
                this.animeCache[foundTmdb.id].aniId = anilistMedia.id;
                if (!this.animeCache[`${foundTmdb.id}_s1`])
                  this.animeCache[`${foundTmdb.id}_s1`] = {};
                this.animeCache[`${foundTmdb.id}_s1`].aniId = anilistMedia.id;
                const aniCached = this.animeCache["ani_" + anilistMedia.id];
                if (aniCached) {
                  this.animeCache[foundTmdb.id] = {
                    ...this.animeCache[foundTmdb.id],
                    ...aniCached,
                  };
                  this.animeCache[`${foundTmdb.id}_s1`] = {
                    ...this.animeCache[`${foundTmdb.id}_s1`],
                    ...aniCached,
                  };
                }
              }
              data.isAnime = true;
              resolvedId = foundTmdb.id;
            } else {
              if (!anilistMedia.description || !anilistMedia.episodes) {
                try {
                  const aRes = await this.aniApi(this.ANI_MEDIA_QUERY, {
                    id: aniNum,
                  });
                  if (aRes?.data?.Media) anilistMedia = aRes.data.Media;
                } catch (e) {}
              }
              const aTitle =
                anilistMedia.title?.english ||
                anilistMedia.title?.romaji ||
                anilistMedia.title?.userPreferred ||
                "";
              const aDate = anilistMedia.startDate?.year
                ? `${anilistMedia.startDate.year}-${String(anilistMedia.startDate.month || 1).padStart(2, "0")}-${String(anilistMedia.startDate.day || 1).padStart(2, "0")}`
                : "";
              const epCount = anilistMedia.episodes || 1;
              const aCtry = anilistMedia.countryOfOrigin || "JP";
              data = {
                id: "ani_" + anilistMedia.id,
                ani_id: anilistMedia.id,
                mal_id: anilistMedia.idMal || anilistMedia.id,
                title: aTitle,
                name: aTitle,
                overview: (anilistMedia.description || "")
                  .replace(/<[^>]*>/g, "")
                  .replace(
                    /\s*[\(\[]?\s*\b(?:Source\s*:|Written by\b)[^\)\n\r\]]+[\)\]]?\s*/gi,
                    "\n",
                  )
                  .replace(/\n\s*\n\s*\n+/g, "\n\n")
                  .trim(),
                poster_path:
                  anilistMedia.coverImage?.extraLarge ||
                  anilistMedia.coverImage?.large,
                backdrop_path:
                  anilistMedia.bannerImage ||
                  anilistMedia.coverImage?.extraLarge,
                release_date: aDate,
                first_air_date: aDate,
                vote_average: anilistMedia.averageScore
                  ? anilistMedia.averageScore / 10
                  : 0,
                vote_count: 0,
                genres: (anilistMedia.genres || []).map((g) => ({
                  id: g,
                  name: g,
                })),
                runtime: anilistMedia.duration || 24,
                country: aCtry,
                origin_country: [aCtry],
                original_language:
                  aCtry === "JP" ? "ja" : aCtry === "KR" ? "ko" : "zh",
                spoken_languages: [
                  {
                    iso_639_1:
                      aCtry === "JP" ? "ja" : aCtry === "KR" ? "ko" : "zh",
                    english_name:
                      aCtry === "JP"
                        ? "Japanese"
                        : aCtry === "KR"
                          ? "Korean"
                          : "Chinese",
                    name:
                      aCtry === "JP"
                        ? "Japanese"
                        : aCtry === "KR"
                          ? "Korean"
                          : "Chinese",
                  },
                ],
                production_countries: [
                  {
                    iso_3166_1: aCtry,
                    name:
                      aCtry === "JP"
                        ? "Japan"
                        : aCtry === "KR"
                          ? "South Korea"
                          : "China",
                  },
                ],
                status: anilistMedia.status || "Finished",
                type:
                  anilistMedia.format === "OVA"
                    ? "OVA"
                    : anilistMedia.format === "ONA"
                      ? "ONA"
                      : anilistMedia.format === "SPECIAL"
                        ? "Special"
                        : anilistMedia.format === "TV_SHORT"
                          ? "Short"
                          : "Scripted",
                season: anilistMedia.season || null,
                seasonYear:
                  anilistMedia.seasonYear ||
                  anilistMedia.startDate?.year ||
                  null,
                is_anilist: true,
                isAnime: true,
                _noTmdb: true,
                number_of_seasons: 1,
                number_of_episodes: epCount,
                seasons:
                  resolvedType === "tv"
                    ? [
                        {
                          season_number: 1,
                          name: "Season 1",
                          episode_count: epCount,
                        },
                      ]
                    : [],
                credits: { cast: [], crew: [] },
                videos: { results: [] },
                images: {
                  backdrops: anilistMedia.bannerImage
                    ? [{ file_path: anilistMedia.bannerImage }]
                    : [],
                  posters: [
                    {
                      file_path:
                        anilistMedia.coverImage?.extraLarge ||
                        anilistMedia.coverImage?.large,
                    },
                  ],
                  logos: [],
                },
              };
              const pLogo = await this.fetchAnimeParentLogo(
                anilistMedia,
                aTitle,
              );
              if (pLogo && pLogo.file_path) {
                data.images.logos = [pLogo];
              }
              resolvedId = "ani_" + anilistMedia.id;
            }
          }
        }
        if (
          !data &&
          (typeof resolvedId === "number" ||
            (!String(resolvedId).startsWith("tt") &&
              !String(resolvedId).startsWith("ani_")))
        ) {
          if (resolvedType === "movie") {
            this.getFanartLogo("movie", resolvedId);
          }
          data = await this.api(`/${resolvedType}/${resolvedId}`, {
            append_to_response:
              resolvedType === "tv"
                ? "aggregate_credits,credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers"
                : "credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers",
            include_image_language: "en,null",
            include_video_language: "en,null",
          });
          if (
            data &&
            data.aggregate_credits?.cast &&
            Array.isArray(data.aggregate_credits.cast) &&
            data.aggregate_credits.cast.length > 0
          ) {
            const isAnimShow = Boolean(
              data.genre_ids?.includes(16) ||
              data.genres?.some((g) =>
                typeof g === "object" && g
                  ? g.id === 16 ||
                    (g.name && String(g.name).toLowerCase().includes("anim"))
                  : g === 16 || String(g).toLowerCase().includes("anim"),
              ),
            );
            if (!data.credits) data.credits = {};
            data.credits.cast = data.aggregate_credits.cast
              .slice(0, 60)
              .map((c) => {
                let charStr = "";
                const cleanLiveChar = (s) =>
                  String(s || "")
                    .split(/\s*\/\s*/)[0]
                    .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
                    .trim();
                const cleanAnimChar = (s) =>
                  String(s || "")
                    .replace(/\s*\((?:[^)]*voice[^)]*)\)/gi, "")
                    .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
                    .trim();
                if (Array.isArray(c.roles) && c.roles.length > 0) {
                  const sorted = [...c.roles].sort(
                    (a, b) => (b.episode_count || 0) - (a.episode_count || 0),
                  );
                  if (!isAnimShow) {
                    charStr = cleanLiveChar(
                      sorted[0]?.character || c.character,
                    );
                  } else {
                    const maxEp = sorted[0]?.episode_count || 0;
                    const threshold = Math.max(4, Math.round(maxEp * 0.45));
                    const qualRoles = sorted.filter(
                      (r, idx) =>
                        idx === 0 || (r.episode_count || 0) >= threshold,
                    );
                    const seen = new Set();
                    const parts = [];
                    for (const r of qualRoles) {
                      const rawTokens = String(r.character || "").split(
                        /\s*\/\s*/,
                      );
                      for (const token of rawTokens) {
                        const ch = cleanAnimChar(token);
                        const norm = ch.toLowerCase();
                        if (ch && !seen.has(norm)) {
                          seen.add(norm);
                          parts.push(ch);
                        }
                      }
                    }
                    charStr = parts.join(" / ");
                  }
                } else {
                  if (!isAnimShow) {
                    charStr = cleanLiveChar(c.character);
                  } else {
                    const rawTokens = String(c.character || "").split(
                      /\s*\/\s*/,
                    );
                    const seen = new Set();
                    const parts = [];
                    for (const token of rawTokens) {
                      const ch = cleanAnimChar(token);
                      const norm = ch.toLowerCase();
                      if (ch && !seen.has(norm)) {
                        seen.add(norm);
                        parts.push(ch);
                      }
                    }
                    charStr = parts.join(" / ");
                  }
                }
                return {
                  id: c.id,
                  name: c.name,
                  character: charStr,
                  roles: Array.isArray(c.roles)
                    ? c.roles.slice(0, 5)
                    : undefined,
                  profile_path: c.profile_path,
                };
              });
          }
        }
        if (!data || !data.id) {
          if (typeof id === "string" && id.startsWith("tt")) {
            const fallbacks = await this.fetchExternalFallbacks(id, true, true);
            if (fallbacks.length > 0) {
              data = fallbacks[0];
              resolvedId = data.id;
              resolvedType = data.media_type;
            }
          }
        }
      }
      if (!data || !data.id) {
        this.$g("si-title").innerText = "Error loading data";
        this.$display(["si-initial-loader"], "none");
        this.hidePageReloadOverlay();
        this.stopLoader();
        return;
      }
      id = resolvedId;
      type = resolvedType;
      if (!this.showDetailsCache) this.showDetailsCache = {};
      const canonKey = `${resolvedType || type}_${resolvedId || data.id || id}`;
      const cleanEntry = this.sanitizeShowDetails({
        data,
        anilistMedia,
        resolvedId,
        resolvedType,
      });
      this.lruSet(this.showDetailsCache, canonKey, cleanEntry);
      new Set([
        `${type}_${id}`,
        showCacheKey,
        data.id ? `${type}_${data.id}` : "",
      ]).forEach((k) => {
        if (k && k !== canonKey)
          this.lruSet(this.showDetailsCache, k, { _ref: canonKey });
      });
      this.persistCache("show");
      if (this.animeDotsTimer) {
        clearTimeout(this.animeDotsTimer);
        this.animeDotsTimer = null;
      }
      if (this.animeDelayTimer) {
        clearTimeout(this.animeDelayTimer);
        this.animeDelayTimer = null;
      }
      const initSeasonsHeader = this.$g("si-seasons-header");
      if (initSeasonsHeader) initSeasonsHeader.style.display = "";
      const metaKey = `${type}_${id}`;
      if (data.type && type === "tv") this.tvTypeCache[metaKey] = data.type;
      const isAnim =
        data.is_anilist ||
        data.isAnime ||
        (this.isAnimeItem && this.isAnimeItem(data)) ||
        (data.genres || []).some(
          (g) =>
            g.id === 16 || (g.name && g.name.toLowerCase() === "animation"),
        );
      const isJapan = this.hasCountryOrigin(data, "JP", "Japan", "ja");
      const isAnimeShowMeta = this.isAnimeItem(data);
      if (isAnimeShowMeta) {
        data.isAnime = true;
        if (!data.genres) data.genres = [];
        if (
          !data.genres.some(
            (g) =>
              g.id === 16 || (g.name && g.name.toLowerCase() === "animation"),
          )
        ) {
          data.genres.unshift({ id: 16, name: "Animation" });
        }
      }
      const cachedAnimeInfo =
        this.animeCache &&
        ((this.animeCache[String(data.id)]?._chainComplete
          ? this.animeCache[String(data.id)]
          : null) ||
          (this.animeCache[`${data.id}_s1`]?._chainComplete
            ? this.animeCache[`${data.id}_s1`]
            : null) ||
          (this.animeCache[String(data.id)]?.sequelChain
            ? this.animeCache[String(data.id)]
            : null) ||
          (this.animeCache[`${data.id}_s1`]?.sequelChain
            ? this.animeCache[`${data.id}_s1`]
            : null) ||
          (this.animeCache[String(data.id)]?.aniId
            ? this.animeCache[String(data.id)]
            : null) ||
          (this.animeCache[`${data.id}_s1`]?.aniId
            ? this.animeCache[`${data.id}_s1`]
            : null) ||
          this.animeCache[String(data.id)] ||
          this.animeCache[`${data.id}_s1`]);
      let cachedAnimeS1 = cachedAnimeInfo;
      if (
        cachedAnimeInfo &&
        (String(data.id) === "42511" ||
          cachedAnimeInfo.aniId === 849 ||
          (cachedAnimeInfo.romaji &&
            /suzumiya\s*haruhi/i.test(cachedAnimeInfo.romaji)))
      ) {
        if (
          !cachedAnimeInfo.sequelChain ||
          cachedAnimeInfo.sequelChain.length <= 1
        ) {
          cachedAnimeInfo.sequelChain = [
            {
              id: 849,
              idMal: 849,
              episodes: 14,
              format: "TV",
              season: 1,
              title: { romaji: "Suzumiya Haruhi no Yuutsu" },
            },
            {
              id: 4382,
              idMal: 4382,
              episodes: 14,
              format: "TV",
              season: 2,
              title: { romaji: "Suzumiya Haruhi no Yuutsu (2009)" },
            },
          ];
        }
      }
      const validSeasons =
        type === "tv"
          ? (data.seasons || []).filter((s) => this.isSeasonAired(s))
          : [];
      if (!this.cardItemCache) this.cardItemCache = {};
      const cleanCard = this.sanitizeCardItem(data);
      this.lruSet(this.cardItemCache, String(id), cleanCard);
      if (data.id) {
        this.lruSet(this.cardItemCache, String(data.id), cleanCard);
      }
      const tvdbId = data.external_ids?.tvdb_id;
      if (type === "tv" && tvdbId) {
        this.getFanartLogo("tv", id, tvdbId);
      }
      let videos = data.videos?.results || [];
      if (
        videos.length === 0 &&
        !data.is_anilist &&
        !String(id).startsWith("ani_")
      ) {
        const vRes = await this.api(`/${type}/${id}/videos`, {
          include_video_language: "en,null",
        });
        videos = vRes.results || [];
      }
      let aniTrailerKey = null;
      if (
        anilistMedia?.trailer?.id &&
        (anilistMedia.trailer.site || "").toLowerCase() === "youtube"
      ) {
        aniTrailerKey = anilistMedia.trailer.id;
      } else if (
        cachedAnimeInfo?.trailer?.id &&
        (cachedAnimeInfo.trailer.site || "").toLowerCase() === "youtube"
      ) {
        aniTrailerKey = cachedAnimeInfo.trailer.id;
      }
      const tmdbTrailer =
        videos.find(
          (v) => v.site === "YouTube" && v.type === "Trailer" && v.official,
        ) ||
        videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
        videos.find((v) => v.site === "YouTube" && v.type === "Teaser") ||
        videos.find((v) => v.site === "YouTube" && v.type === "Clip") ||
        videos.find((v) => v.site === "YouTube");
      const finalTrailerKey = aniTrailerKey || (tmdbTrailer && tmdbTrailer.key);
      if (trailerBtn) {
        if (finalTrailerKey) {
          trailerBtn.onclick = () => app.playTrailer(finalTrailerKey);
          trailerBtn.dataset.hasTrailer = "1";
        } else {
          trailerBtn.dataset.hasTrailer = "0";
        }
      }
      const title = data.title || data.name;
      const pageTitle = `${title}`;
      const url = `?view=showinfo&type=${type}&id=${id}`;
      this.syncHistoryUrl(
        { view: "showinfo", id, type },
        pageTitle,
        url,
        pushState,
        replaceState,
      );
      this.currentShow = data;
      this.currentShow.media_type = type;
      this.currentShow.country = this.getCountryCode(data);
      this.currentShow.language = this.getShowLanguageList(data);
      if (this.currentShow.country)
        this.countryCache[`${type}_${id}`] = this.currentShow.country;
      const showBd = !this.uiPrefs || this.uiPrefs.showBackdrop !== false;
      this.applyShowinfoBackdropPref(showBd);
      this.$display(["si-initial-loader"], "none");
      this.hidePageReloadOverlay();
      this.$display(["si-lower-loader"], "flex");
      setTimeout(() => {
        if (
          currentShowinfoReqId === this.siReqId &&
          this.currentView === "showinfo"
        ) {
          this.$display(["si-lower-loader"], "none");
        }
      }, 10000);
      let lowerSeasonsReady =
        type === "movie" ||
        scrollToEpisodes ||
        !data.seasons ||
        data.seasons.length === 0;
      let lowerCastReady = false;
      let lowerSimReady = false;
      let showMediaPlanned = false;
      const checkLowerReady = () => {
        if (currentShowinfoReqId !== this.siReqId) return;
        if (lowerSeasonsReady && lowerCastReady && lowerSimReady) {
          this.$display(["si-lower-loader"], "none");
          const mSecEl = this.$g("si-media-section");
          if (mSecEl && showMediaPlanned) {
            mSecEl.style.display = "block";
          }
          if (type === "tv" && !scrollToEpisodes) {
            const sSec = this.$g("si-seasons-section");
            if (
              sSec &&
              this.currentShowSeasonList &&
              this.currentShowSeasonList.length > 0
            ) {
              sSec.style.display = "block";
              const sHdr = this.$g("si-seasons-header");
              if (sHdr) sHdr.style.display = "";
            }
          }
          const castSecEl = this.$g("si-cast-section");
          if (castSecEl && showCastPlanned) {
            castSecEl.style.display = "block";
            const cRow = this.$g("si-cast-row");
            if (cRow) {
              cRow.scrollLeft = 0;
              if (typeof this.checkScrollArrow === "function")
                this.checkScrollArrow(cRow);
              requestAnimationFrame(() => {
                if (cRow) {
                  cRow.scrollLeft = 0;
                  if (typeof this.checkScrollArrow === "function")
                    this.checkScrollArrow(cRow);
                }
              });
            }
          }
          const simSecEl = this.$g("si-similar-section");
          if (simSecEl && showSimPlanned) {
            simSecEl.style.display = "block";
            const sRow = this.$g("si-similar-row");
            if (sRow && typeof this.checkScrollArrow === "function")
              this.checkScrollArrow(sRow);
          }
          this.updateArrows();
        }
      };
      let showCastPlanned = false;
      let showSimPlanned = false;
      let chosenPoster = data.poster_path;
      if (data.images?.posters?.length > 0) {
        const tlPoster = data.images.posters.find(
          (p) => (!p.iso_639_1 || p.iso_639_1 === "xx") && p.file_path,
        );
        const enPoster = data.images.posters.find(
          (p) => p.iso_639_1 === "en" && p.file_path,
        );
        chosenPoster =
          tlPoster?.file_path || enPoster?.file_path || data.poster_path;
      }
      if (chosenPoster) {
        siPoster.classList.remove("loaded");
        if (siPosterWrap) siPosterWrap.classList.remove("loaded");
        siPoster.src = this.getImg(chosenPoster, "poster");
      }
      const year = this.getItemYear(data);
      const bPoster =
        data.poster_path || this.currentShow?.poster_path || chosenPoster || "";
      this.saveBrowsingHistory(
        Object.assign(this.toCardSummary(data, type), {
          poster_path: bPoster,
          country: this.currentShow?.country || "",
        }),
      );
      const logos = data.images?.logos || [];
      const chosenLogo =
        logos.find((l) => l.iso_639_1 === "en") ||
        logos.find((l) => !l.iso_639_1) ||
        logos[0];
      const siTitle = this.$g("si-title");
      const allowLogo = !this.uiPrefs || this.uiPrefs.titleLogo !== false;
      if (allowLogo && chosenLogo && chosenLogo.file_path) {
        siTitle.innerHTML = this.buildLogoImgHtml(
          this.getImg(chosenLogo.file_path, "logo"),
          title,
          "showinfo-title-logo",
          `app.handleLogoError(this, '${type}', '${id}', '${tvdbId || ""}', '${title.replace(/'/g, "\\'")}');`,
        );
      } else if (
        allowLogo &&
        (String(id).startsWith("ani_") || data.is_anilist || data._noTmdb)
      ) {
        this.fetchAnimeParentLogo(anilistMedia || data, title).then((pLogo) => {
          if (
            pLogo?.file_path &&
            (!this.uiPrefs || this.uiPrefs.titleLogo !== false)
          ) {
            if (!data.images) data.images = {};
            data.images.logos = [pLogo];
            siTitle.innerHTML = this.buildLogoImgHtml(
              this.getImg(pLogo.file_path, "logo"),
              title,
              "showinfo-title-logo",
            );
          } else {
            siTitle.innerText = title;
          }
        });
      } else if (allowLogo) {
        this.getFanartLogo(type, id, tvdbId).then((fUrl) => {
          if (fUrl && (!this.uiPrefs || this.uiPrefs.titleLogo !== false))
            siTitle.innerHTML = this.buildLogoImgHtml(
              fUrl,
              title,
              "showinfo-title-logo",
            );
          else siTitle.innerText = title;
        });
      } else {
        siTitle.innerText = title;
      }
      const contentRating = this.cacheShowMeta(data, type, id);
      if (this.isUserBlocked(data, type)) {
        this.showToast("This title is blocked by your Blocklist.");
        this.goBack();
        return;
      }
      if (
        this.deadIds &&
        (this.deadIds.has(String(id)) || this.deadIds.has(String(data.id))) &&
        data.id &&
        (data.title || data.name) &&
        (data.poster_path || data.backdrop_path) &&
        !data.adult
      ) {
        this.deadIds.delete(String(id));
        this.deadIds.delete(String(data.id));
        this.deadIds.delete(Number(id));
        this.$storeSet("sh_dead_ids", Array.from(this.deadIds));
      }
      if (this.isBlocked(data, type)) {
        const deadIdStr = String(id || data.id);
        if (!this.deadIds) this.deadIds = new Set();
        this.deadIds.add(deadIdStr);
        this.$storeSet("sh_dead_ids", Array.from(this.deadIds));
        document
          .querySelectorAll(`.poster-card[data-show-id="${id}"]`)
          .forEach((el) => el.remove());
        this.showToast("Details unavailable for this title.");
        this.goBack();
        return;
      }
      const ratingBadge = contentRating
        ? `<span class="content-rating-badge" style="font-weight:800;color:#ffffff;border:1px solid #ffffff66;border-radius:4px;padding:1px 6px;font-size:0.75rem;letter-spacing:0.03em;display:inline-flex;align-items:center;white-space:nowrap;flex-shrink:0;">${contentRating}</span>`
        : "";
      const runtime = this.formatRuntime(
        data.runtime || data.episode_run_time?.[0],
      );
      const simPromise =
        !data.is_omdb && !String(id).startsWith("tt")
          ? this.fetchPrioritizedSimilar(id, type, data, 1)
          : Promise.resolve([]);
      const tmdbFallbackRate =
        typeof data.vote_average === "number" && data.vote_average > 0
          ? data.vote_average.toFixed(1)
          : data.vote_average
            ? String(data.vote_average)
            : null;
      const starPromise = this.resolveStarRating(data, type).catch(
        () => tmdbFallbackRate,
      );
      let timedOutStar = false;
      let displayRating = await Promise.race([
        starPromise,
        new Promise((res) =>
          setTimeout(() => {
            timedOutStar = true;
            res(tmdbFallbackRate);
          }, 1500),
        ),
      ]);
      if (currentShowinfoReqId !== this.siReqId) return;
      if (timedOutStar) {
        starPromise.then((lateRate) => {
          if (
            !lateRate ||
            currentShowinfoReqId !== this.siReqId ||
            this.currentView !== "showinfo"
          )
            return;
          const rEl = this.$g("si-star-rating-val");
          if (rEl && lateRate !== displayRating) rEl.textContent = lateRate;
          document
            .querySelectorAll(`.badge-rate-${type}-${id}`)
            .forEach((el) => {
              el.textContent = lateRate;
              el.parentElement.style.display = "inline-flex";
            });
        });
      }
      if (displayRating) {
        document.querySelectorAll(`.badge-rate-${type}-${id}`).forEach((el) => {
          el.textContent = displayRating;
          el.parentElement.style.display = "inline-flex";
        });
      }
      let ratingVoteCount =
        typeof data.vote_count === "number" ? data.vote_count : null;
      const isLowVote10 =
        (displayRating === "10.0" || displayRating === "10") &&
        (ratingVoteCount === null || ratingVoteCount < 50);
      const hintBtnHtml = isLowVote10
        ? ` <button type="button" class="rating-hint-btn" onclick="event.stopPropagation();app.toggleVoteFluctuate(this,'si-vote-fluctuate')">?</button>`
        : "";
      const ratingDisplayHtml = displayRating
        ? `<span style="color:#f5c518;font-weight:bold;display:inline-flex;align-items:center;gap:4px;">${STAR_SVG(13, 13)}<span id="si-star-rating-val">${displayRating}</span>${hintBtnHtml}</span>`
        : "";
      let initialSeasonStr = "";
      const rawSeasonVal =
        data.season || anilistMedia?.season || cachedAnimeInfo?.season || "";
      if (isAnimeShowMeta && rawSeasonVal) {
        initialSeasonStr = `${rawSeasonVal.charAt(0).toUpperCase()}${rawSeasonVal.slice(1).toLowerCase()} `;
      }
      const aniFmt = anilistMedia?.format || cachedAnimeInfo?.animeFormat || "";
      const rawShowType =
        aniFmt === "ONA" || aniFmt === "OVA" || aniFmt === "SPECIAL"
          ? aniFmt === "SPECIAL"
            ? "Special"
            : aniFmt
          : this.getRawTvType(data, id);
      const typeDisplayLabel =
        type === "movie"
          ? this.formatMovieType(this.resolveMovieType(data), "showinfo")
          : this.formatSeriesType(rawShowType, "showinfo");
      const fluctuateMsgHtml = isLowVote10
        ? `<div id="si-vote-fluctuate" class="vote-fluctuate-msg">Based on very few user votes, score may fluctuate</div>`
        : "";
      const siParts = [];
      if (typeDisplayLabel)
        siParts.push(`<span id="si-type-label">${typeDisplayLabel}</span>`);
      if (year || initialSeasonStr)
        siParts.push(
          `<span><span id="si-anime-season">${initialSeasonStr}</span>${year}</span>`,
        );
      if (ratingBadge) siParts.push(ratingBadge);
      if (runtime) siParts.push(`<span>${runtime}</span>`);
      if (ratingDisplayHtml) siParts.push(ratingDisplayHtml);
      this.$g("si-meta").innerHTML = siParts.join(" &bull; ");
      this.fitShowinfoMeta();
      requestAnimationFrame(() => this.fitShowinfoMeta());
      const existingFluctuate = this.$g("si-vote-fluctuate");
      if (existingFluctuate) existingFluctuate.remove();
      if (fluctuateMsgHtml)
        this.$g("si-meta").insertAdjacentHTML("afterend", fluctuateMsgHtml);
      const rawDesc = (data.overview || "").replace(/—/g, " ");
      const isAniDesc = Boolean(
        data.is_anilist ||
        String(id).startsWith("ani_") ||
        data._noTmdb ||
        (this.isAnimeItem && this.isAnimeItem(data)),
      );
      this.$g("si-desc").innerText = isAniDesc
        ? rawDesc
            .replace(
              /\s*[\(\[]?\s*\b(?:Source\s*:|Written by\b)[^\)\n\r\]]+[\)\]]?\s*/gi,
              "\n",
            )
            .replace(/\n\s*\n\s*\n+/g, "\n\n")
            .trim()
        : rawDesc;
      const status = data.status || "Unknown";
      const cachedAniGenres = isAnimeShowMeta
        ? anilistMedia?.genres || cachedAnimeInfo?.genres
        : null;
      const genres = (
        cachedAniGenres?.length
          ? cachedAniGenres
          : (data.genres || [])
              .map((g) => g.name || g)
              .filter((name) =>
                isAnimeShowMeta
                  ? String(name).toLowerCase() !== "animation"
                  : true,
              )
      ).join(", ");
      let theatricalWarning = "";
      if (type === "movie" && data.release_date) {
        const now = new Date();
        const relD = new Date(data.release_date);
        const diffDays = (now - relD) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0 && diffDays <= 90) {
          let hasDigitalOrPhysical = false;
          if (data.release_dates && data.release_dates.results) {
            data.release_dates.results.forEach((c) => {
              (c.release_dates || []).forEach((r) => {
                if ([4, 5].includes(r.type)) {
                  const d = r.release_date ? new Date(r.release_date) : null;
                  if (d && d <= now) hasDigitalOrPhysical = true;
                }
              });
            });
          }
          if (!hasDigitalOrPhysical) {
            theatricalWarning =
              '<div class="theatrical-warning"><span>In Theaters</span></div>';
          }
        }
      }
      let immediateRomaji =
        anilistMedia?.title?.romaji || cachedAnimeInfo?.romaji || "";
      if (!immediateRomaji && isJapan && isAnim) {
        const rTitle = this.getTmdbRomaji(data);
        if (rTitle) immediateRomaji = rTitle.trim();
      }
      if (immediateRomaji && (data.is_anilist || (isJapan && isAnim))) {
        if (!this.animeCache) this.animeCache = {};
        this.lruSet(
          this.animeCache,
          String(data.id),
          {
            ...this.animeCache[String(data.id)],
            romaji: immediateRomaji,
          },
          "anime",
        );
      }
      let relDateVal = "";
      if (type === "movie" && data.release_date) {
        const p = data.release_date.split("-");
        if (p.length === 3 && p[0] && p[1] && p[2]) {
          const months = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ];
          const mIdx = parseInt(p[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            relDateVal = `${p[2].padStart(2, "0")} ${months[mIdx]} ${p[0]}`;
          }
        }
      }
      let extraMetaHtml = theatricalWarning || "";
      if (title)
        extraMetaHtml += `<div><span class="meta-label">Title</span> <span class="meta-val">${title}</span></div>`;
      if (isAnimeShowMeta || (isJapan && isAnim) || data.is_anilist) {
        let origJpTitle = "";
        const tmdbOrig = (
          data.original_name ||
          data.original_title ||
          ""
        ).trim();
        const aniNative = (
          anilistMedia?.title?.native ||
          cachedAnimeInfo?.native ||
          ""
        ).trim();
        if (
          tmdbOrig &&
          /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(tmdbOrig)
        ) {
          origJpTitle = tmdbOrig;
        } else if (
          aniNative &&
          /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(aniNative)
        ) {
          origJpTitle = aniNative;
        } else if (tmdbOrig && tmdbOrig !== title) {
          origJpTitle = tmdbOrig;
        } else if (aniNative) {
          origJpTitle = aniNative;
        }
        const origTitleSpan = origJpTitle
          ? '<span class="meta-label">Original Title</span> <span class="meta-val">' +
            origJpTitle +
            "</span>"
          : "";
        extraMetaHtml += `<div id="si-orig-title-row">${origTitleSpan}</div>`;
        const initRomaji = immediateRomaji || cachedAnimeInfo?.romaji || "";
        const romajiSpan = initRomaji
          ? '<span class="meta-label">Romanization</span> <span class="meta-val">' +
            initRomaji +
            "</span>"
          : "";
        extraMetaHtml += `<div id="si-romaji-row">${romajiSpan}</div>`;
      }
      if (genres)
        extraMetaHtml += `<div><span class="meta-label">Genre</span> <span class="meta-val" id="si-genres-val">${genres}</span></div>`;
      if (status)
        extraMetaHtml += `<div><span class="meta-label">Status</span> <span class="meta-val">${status}</span></div>`;
      if (type === "tv") {
        const defaultSCount =
          validSeasons.length > 0
            ? validSeasons.length
            : data.number_of_seasons || 0;
        const effectiveAnimeSeq = cachedAnimeInfo?.sequelChain || null;
        const cachedSCount =
          validSeasons.length <= 1 &&
          effectiveAnimeSeq &&
          effectiveAnimeSeq.length > 1
            ? Math.max(...effectiveAnimeSeq.map((s) => s.season || 1))
            : defaultSCount;
        extraMetaHtml += `<div><span class="meta-label">Seasons</span> <span class="meta-val" id="si-seasons-val">${cachedSCount}</span></div><div><span class="meta-label">Episodes</span> <span class="meta-val">${data.number_of_episodes || 0}</span></div>`;
      } else if (relDateVal) {
        extraMetaHtml += `<div><span class="meta-label">Release Date</span> <span class="meta-val">${relDateVal}</span></div>`;
      }
      let countryList = "";
      if (data.production_countries && data.production_countries.length > 0) {
        countryList = data.production_countries
          .map((c) => this.countryOverrides[c.iso_3166_1] || c.name)
          .join(", ");
      } else if (data.origin_country && data.origin_country.length > 0) {
        countryList = data.origin_country
          .map((c) => this.countryOverrides[c] || this.countryMap[c] || c)
          .join(", ");
      }
      const escMetaAttr = (s) =>
        String(s || "")
          .replace(/'/g, "\\'")
          .replace(/"/g, "&quot;");
      const makePersonLink = (id, name, dept) => {
        if (!name) return "";
        if (!id) return name;
        return (
          '<span class="si-meta-link clickable" onclick="app.openPerson(' +
          id +
          ",true,false,'" +
          escMetaAttr(dept) +
          "')\">" +
          name +
          "</span>"
        );
      };
      const makeSourceLink = (id, name, srcType) => {
        if (!name) return "";
        if (!id) return name;
        return (
          '<span class="si-meta-link clickable" onclick="app.openSource(' +
          id +
          ",'" +
          srcType +
          "','" +
          escMetaAttr(name) +
          "')\">" +
          name +
          "</span>"
        );
      };
      const dedupeList = (items, keyFn) => {
        const seen = new Set();
        const out = [];
        for (const it of items || []) {
          if (!it) continue;
          const k = keyFn ? keyFn(it) : it;
          if (k && !seen.has(k)) {
            seen.add(k);
            out.push(it);
          }
        }
        return out;
      };
      const row = (lbl, val, bold = false) =>
        val
          ? '<div><span class="meta-label">' +
            lbl +
            '</span> <span class="meta-val"' +
            (bold ? ' style="font-weight:bold;"' : "") +
            ">" +
            val +
            "</span></div>"
          : "";
      if (
        type === "tv" &&
        Array.isArray(data.created_by) &&
        data.created_by.length > 0
      ) {
        const creators = dedupeList(
          data.created_by,
          (c) => c.id || c.name,
        ).slice(0, 3);
        extraMetaHtml += row(
          "Creators",
          creators
            .map((c) => makePersonLink(c.id, c.name, "Creator"))
            .join(" &bull; "),
        );
      } else if (data.credits?.crew && Array.isArray(data.credits.crew)) {
        const directors = dedupeList(
          data.credits.crew.filter((c) => c.job === "Director"),
          (c) => c.id || c.name,
        ).slice(0, 3);
        if (directors.length > 0) {
          extraMetaHtml += row(
            "Directors",
            directors
              .map((c) => makePersonLink(c.id, c.name, "Directing"))
              .join(" &bull; "),
          );
        }
        const writers = dedupeList(
          data.credits.crew.filter(
            (c) =>
              c.job === "Writer" ||
              c.department === "Writing" ||
              c.job === "Screenplay" ||
              c.job === "Story" ||
              c.job === "Characters",
          ),
          (c) => c.id || c.name,
        ).slice(0, 3);
        if (writers.length > 0) {
          extraMetaHtml += row(
            "Writers",
            writers
              .map((c) => makePersonLink(c.id, c.name, "Writing"))
              .join(" &bull; "),
          );
        }
      }
      if (data.production_companies?.length > 0) {
        const compLimit = isAnimeShowMeta ? 5 : 3;
        const comps = dedupeList(
          data.production_companies,
          (p) => p.id || p.name,
        ).slice(0, compLimit);
        extraMetaHtml += row(
          "Production Company",
          comps
            .map((p) => makeSourceLink(p.id, p.name, "company"))
            .join(" &bull; "),
        );
      }
      if (type === "tv" && !isAnimeShowMeta && data.networks?.length > 0) {
        const nets = dedupeList(data.networks, (n) => n.id || n.name).slice(
          0,
          3,
        );
        extraMetaHtml += row(
          "Network",
          nets
            .map((n) => makeSourceLink(n.id, n.name, "network"))
            .join(" &bull; "),
        );
      }
      if (countryList) extraMetaHtml += row("Country", countryList);
      const languageList = data.languageList || this.getShowLanguageList(data);
      if (languageList) extraMetaHtml += row("Language", languageList);
      this.$g("si-extra-meta").innerHTML = extraMetaHtml;
      let animeInfo = null;
      let hasValidChain = false;
      let fallbackSingleAnime = null;
      if (isAnimeShowMeta && !data.is_anilist) {
        data.isAnime = true;
        cachedAnimeS1 = cachedAnimeInfo;
        const tmdbEpTotal =
          validSeasons.reduce((sum, s) => sum + (s.episode_count || 0), 0) ||
          data.number_of_episodes ||
          0;
        hasValidChain = Boolean(
          cachedAnimeS1?._chainComplete &&
          Array.isArray(cachedAnimeS1.sequelChain) &&
          (cachedAnimeS1.sequelChain.length > 1 ||
            (cachedAnimeS1.sequelChain.length === 1 &&
              tmdbEpTotal > 0 &&
              tmdbEpTotal <=
                (cachedAnimeS1.sequelChain[0].episodes || tmdbEpTotal))),
        );
        const applyAnimeMeta = (info) => {
          if (
            !info ||
            currentShowinfoReqId !== this.siReqId ||
            this.currentView !== "showinfo" ||
            !this.currentShow ||
            String(this.currentShow.id) !== String(data.id)
          )
            return;
          if (this.animeDotsTimer) {
            clearTimeout(this.animeDotsTimer);
            this.animeDotsTimer = null;
          }
          if (this.animeDelayTimer) {
            clearTimeout(this.animeDelayTimer);
            this.animeDelayTimer = null;
          }
          const seasonsHeader = this.$g("si-seasons-header");
          if (seasonsHeader) seasonsHeader.style.display = "";
          info._showId = String(data.id);
          this.currentAnimeInfo = info;
          animeInfo = info;
          hasValidChain = true;
          if (info.aniId) {
            data.ani_id = info.aniId;
            if ((this.castViewMode || "min") === "pic") {
              this.renderCastSection(data, true);
            }
          }
          if (
            type !== "movie" &&
            (info.animeFormat === "ONA" ||
              info.animeFormat === "OVA" ||
              info.animeFormat === "SPECIAL")
          ) {
            const tEl = this.$g("si-type-label");
            if (tEl)
              tEl.textContent =
                info.animeFormat === "SPECIAL" ? "Special" : info.animeFormat;
          }
          if (info.genres?.length) {
            const gEl = this.$g("si-genres-val");
            if (gEl) gEl.textContent = info.genres.join(", ");
          }
          if (info.season && isJapan && isAnim) {
            const sName = `${info.season.charAt(0).toUpperCase()}${info.season.slice(1).toLowerCase()} `;
            const sEl = this.$g("si-anime-season");
            if (sEl) sEl.textContent = sName;
            this.fitShowinfoMeta();
            requestAnimationFrame(() => this.fitShowinfoMeta());
          }
          if (info.native) {
            const oEl = this.$g("si-orig-title-row");
            if (oEl && (!oEl.innerHTML || !oEl.innerHTML.trim())) {
              oEl.innerHTML = `<span class="meta-label">Original Title</span> <span class="meta-val">${info.native}</span>`;
            }
          }
          if (info.romaji) {
            const rEl = this.$g("si-romaji-row");
            if (rEl)
              rEl.innerHTML = `<span class="meta-label">Romanization</span> <span class="meta-val">${info.romaji}</span>`;
          }
          if (
            info.trailer?.id &&
            (info.trailer.site || "").toLowerCase() === "youtube"
          ) {
            const trailerBtn = this.$g("si-trailer-btn");
            if (trailerBtn && trailerBtn.dataset.hasTrailer !== "1") {
              trailerBtn.onclick = () => app.playTrailer(info.trailer.id);
              trailerBtn.dataset.hasTrailer = "1";
              trailerBtn.style.display = "inline-flex";
            }
          }
          if (type === "tv" && validSeasons.length <= 1) {
            const seqChain = info.sequelChain || [];
            let cSeasons = [...new Set(seqChain.map((s) => s.season || 1))];
            cSeasons.sort((a, b) => a - b);
            cSeasons = cSeasons.filter((sNum) => {
              if (sNum === 1) return true;
              if (!tmdbEpTotal) return true;
              for (let ep = 1; ep <= tmdbEpTotal; ep++) {
                if (this.resolveAnimeSequelEp(ep, seqChain).season === sNum)
                  return true;
              }
              return false;
            });
            const animeSeasonItems = (cSeasons.length > 0 ? cSeasons : [1]).map(
              (sNum) => {
                const entry = (seqChain || []).find(
                  (e) => (e.season || 1) === sNum,
                );
                const tmdbS = (data?.seasons || []).find(
                  (ts) => (ts.season_number || ts.season) == sNum,
                );
                const ep1Date =
                  this.episodeCache?.[`${data.id}_s${sNum}`]?.episodes?.[0]
                    ?.air_date ||
                  tmdbS?.episodes?.[0]?.air_date ||
                  null;
                const validBSeasons = new Set([
                  "WINTER",
                  "SPRING",
                  "SUMMER",
                  "FALL",
                ]);
                const entryDate = entry?.startDate?.year
                  ? `${entry.startDate.year}-${String(entry.startDate.month || 1).padStart(2, "0")}-${String(entry.startDate.day || 1).padStart(2, "0")}`
                  : null;
                return {
                  season_number: sNum,
                  name: `Season ${sNum}`,
                  poster_path: entry?.poster_path || tmdbS?.poster_path || "",
                  startDate: entry?.startDate || null,
                  season:
                    entry?.broadcastSeason ||
                    (entry?.season &&
                    validBSeasons.has(String(entry.season).toUpperCase())
                      ? entry.season
                      : null),
                  seasonYear:
                    entry?.seasonYear || entry?.startDate?.year || null,
                  air_date:
                    entry?.air_date ||
                    entryDate ||
                    (sNum === 1 ? ep1Date : tmdbS?.air_date) ||
                    null,
                };
              },
            );
            if (cSeasons.length > 1) {
              const sVal = this.$g("si-seasons-val");
              if (sVal) sVal.textContent = cSeasons.length;
              const sel = this.$g("si-season-select");
              const lastPlayedS = this.getLastPlayedSeason(data);
              const curRemembered =
                lastPlayedS !== null && lastPlayedS !== undefined
                  ? lastPlayedS
                  : parseInt(
                      this.showSeasons[id] || this.showSeasons[data.id],
                      10,
                    ) || 1;
              const targetSeason = cSeasons.includes(curRemembered)
                ? curRemembered
                : cSeasons[0];
              this.currentShowSeasonList = animeSeasonItems;
              if (sel) {
                sel.innerHTML = cSeasons
                  .map((s) => `<option value="${s}">Season ${s}</option>`)
                  .join("");
                sel.value = targetSeason;
                sel.style.display = "none";
              }
              this.renderSeasonCards(animeSeasonItems, targetSeason, data);
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  targetSeason,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  (seasonsSec && !this.$g("si-lower-loader")?.style) ||
                  this.$g("si-lower-loader")?.style.display === "none"
                )
                  seasonsSec.style.display = "block";
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
              this.updateShowinfoPlayBtn();
              this.fetchSeasonEpisodes(
                data.id,
                validSeasons[0]?.season_number || 1,
              ).catch(() => {});
            } else {
              const seasonCardsToUse =
                animeSeasonItems && animeSeasonItems.length > 0
                  ? animeSeasonItems
                  : validSeasons;
              this.currentShowSeasonList = seasonCardsToUse;
              const singleSeason =
                validSeasons[0]?.season_number ||
                data.seasons?.find((s) => s.season_number > 0)?.season_number ||
                1;
              const sel = this.$g("si-season-select");
              if (sel) {
                sel.innerHTML = validSeasons
                  .map(
                    (s) =>
                      `<option value="${s.season_number}">${s.name}</option>`,
                  )
                  .join("");
                sel.value = singleSeason;
                sel.style.display = "none";
              }
              this.renderSeasonCards(seasonCardsToUse, singleSeason, data);
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  singleSeason,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  (seasonsSec && !this.$g("si-lower-loader")?.style) ||
                  this.$g("si-lower-loader")?.style.display === "none"
                )
                  seasonsSec.style.display = "block";
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
              this.fetchSeasonEpisodes(data.id, singleSeason).catch(() => {});
            }
          } else if (type === "tv" && validSeasons.length > 1) {
            const hybridItems =
              info.sequelChain?.length > validSeasons.length
                ? info.hybridSeasonList ||
                  this.buildHybridSeasonList(
                    validSeasons,
                    info.sequelChain,
                    data,
                  )
                : null;
            if (hybridItems && hybridItems.length > validSeasons.length) {
              const sVal = this.$g("si-seasons-val");
              if (sVal) sVal.textContent = validSeasons.length;
              this.currentShowSeasonList = hybridItems;
              const curRemembered =
                parseInt(
                  this.showSeasons[id] || this.showSeasons[data.id],
                  10,
                ) || 1;
              const targetSeason = hybridItems.some(
                (h) => h.season_number === curRemembered,
              )
                ? curRemembered
                : hybridItems[0].season_number;
              const sel = this.$g("si-season-select");
              if (sel) {
                sel.innerHTML = hybridItems
                  .map(
                    (s) =>
                      `<option value="${s.season_number}">${s.name}</option>`,
                  )
                  .join("");
                sel.value = targetSeason;
                sel.style.display = "none";
              }
              if (this.animeDotsTimer) {
                clearTimeout(this.animeDotsTimer);
                this.animeDotsTimer = null;
              }
              this.renderSeasonCards(hybridItems, targetSeason, data);
              const epSec = this.$g("si-episodes-section");
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  targetSeason,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else if (epSec && epSec.style.display !== "none") {
                if (this.currentEpisodes && this.currentEpisodes.length > 0) {
                  const curRemembered =
                    parseInt(
                      this.showSeasons[id] || this.showSeasons[data.id],
                      10,
                    ) || 1;
                  const pageKey = `${data.id}_${curRemembered}`;
                  this.renderEpisodePage(
                    curRemembered,
                    this.showEpPages[pageKey] || 1,
                  );
                } else {
                  this.selectSeasonCard(targetSeason, false);
                }
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  seasonsSec &&
                  (!this.$g("si-lower-loader")?.style ||
                    this.$g("si-lower-loader")?.style.display === "none")
                )
                  seasonsSec.style.display = "block";
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
            } else {
              this.currentShowSeasonList = validSeasons;
              const lastPlayedS = this.getLastPlayedSeason(data);
              const curRemembered =
                lastPlayedS !== null && lastPlayedS !== undefined
                  ? lastPlayedS
                  : parseInt(
                      this.showSeasons[id] || this.showSeasons[data.id],
                      10,
                    ) ||
                    validSeasons[0]?.season_number ||
                    1;
              this.renderSeasonCards(validSeasons, curRemembered, data);
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  curRemembered,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  seasonsSec &&
                  (!this.$g("si-lower-loader")?.style ||
                    this.$g("si-lower-loader")?.style.display === "none")
                )
                  seasonsSec.style.display = "block";
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
            }
          }
        };
        fallbackSingleAnime = () => {
          if (
            currentShowinfoReqId !== this.siReqId ||
            this.currentView !== "showinfo" ||
            !this.currentShow ||
            String(this.currentShow.id) !== String(data.id)
          )
            return;
          if (this.animeDotsTimer) {
            clearTimeout(this.animeDotsTimer);
            this.animeDotsTimer = null;
          }
          if (this.animeDelayTimer) {
            clearTimeout(this.animeDelayTimer);
            this.animeDelayTimer = null;
          }
          const seasonsHeader = this.$g("si-seasons-header");
          if (seasonsHeader) seasonsHeader.style.display = "";
          if (type !== "tv" || validSeasons.length > 1) return;
          this.currentShowSeasonList = validSeasons;
          const singleSeason =
            validSeasons[0]?.season_number ||
            data.seasons?.find((s) => s.season_number > 0)?.season_number ||
            1;
          const sel = this.$g("si-season-select");
          if (sel) {
            sel.innerHTML = validSeasons
              .map(
                (s) => `<option value="${s.season_number}">${s.name}</option>`,
              )
              .join("");
            sel.value = singleSeason;
            sel.style.display = "none";
          }
          this.renderSeasonCards(validSeasons, singleSeason, data);
          const seasonsSec = this.$g("si-seasons-section");
          if (
            (seasonsSec && !this.$g("si-lower-loader")?.style) ||
            this.$g("si-lower-loader")?.style.display === "none"
          )
            seasonsSec.style.display = "block";
          const epSec = this.$g("si-episodes-section");
          if (epSec) epSec.style.display = "none";
          lowerSeasonsReady = true;
          checkLowerReady();
          this.fetchSeasonEpisodes(data.id, singleSeason).catch(() => {});
        };
        if (validSeasons.length > 1) {
          if (cachedAnimeS1 && hasValidChain) {
            animeInfo = cachedAnimeS1;
            applyAnimeMeta(cachedAnimeS1);
          } else {
            this.fetchAnimeInfo(data, 1, false)
              .then((ai) => {
                if (
                  currentShowinfoReqId !== this.siReqId ||
                  this.currentView !== "showinfo" ||
                  !this.currentShow ||
                  String(this.currentShow.id) !== String(data.id)
                )
                  return;
                if (ai) {
                  animeInfo = ai;
                  hasValidChain = true;
                  applyAnimeMeta(ai);
                } else {
                  if (this.animeDotsTimer) {
                    clearTimeout(this.animeDotsTimer);
                    this.animeDotsTimer = null;
                  }
                  const seasonsHeader = this.$g("si-seasons-header");
                  if (seasonsHeader) seasonsHeader.style.display = "";
                  this.currentShowSeasonList = validSeasons;
                  this.renderSeasonCards(
                    validSeasons,
                    validSeasons[0]?.season_number || 1,
                    data,
                  );
                  if (scrollToEpisodes) {
                    this.selectSeasonCard(
                      validSeasons[0]?.season_number || 1,
                      scrollToEpisodes,
                      showOverlay,
                    );
                  } else {
                    const seasonsSec = this.$g("si-seasons-section");
                    if (
                      seasonsSec &&
                      (!this.$g("si-lower-loader")?.style ||
                        this.$g("si-lower-loader")?.style.display === "none")
                    )
                      seasonsSec.style.display = "block";
                    const epSec = this.$g("si-episodes-section");
                    if (epSec) epSec.style.display = "none";
                    lowerSeasonsReady = true;
                    checkLowerReady();
                  }
                }
              })
              .catch(() => {
                if (
                  currentShowinfoReqId !== this.siReqId ||
                  this.currentView !== "showinfo" ||
                  !this.currentShow ||
                  String(this.currentShow.id) !== String(data.id)
                )
                  return;
                if (this.animeDotsTimer) {
                  clearTimeout(this.animeDotsTimer);
                  this.animeDotsTimer = null;
                }
                const seasonsHeader = this.$g("si-seasons-header");
                if (seasonsHeader) seasonsHeader.style.display = "";
                this.currentShowSeasonList = validSeasons;
                this.renderSeasonCards(
                  validSeasons,
                  validSeasons[0]?.season_number || 1,
                  data,
                );
                if (scrollToEpisodes) {
                  this.selectSeasonCard(
                    validSeasons[0]?.season_number || 1,
                    scrollToEpisodes,
                    showOverlay,
                  );
                } else {
                  const seasonsSec = this.$g("si-seasons-section");
                  if (
                    seasonsSec &&
                    (!this.$g("si-lower-loader")?.style ||
                      this.$g("si-lower-loader")?.style.display === "none")
                  )
                    seasonsSec.style.display = "block";
                  const epSec = this.$g("si-episodes-section");
                  if (epSec) epSec.style.display = "none";
                  lowerSeasonsReady = true;
                  checkLowerReady();
                }
              });
          }
        } else if (hasValidChain) {
          animeInfo = cachedAnimeS1;
          applyAnimeMeta(cachedAnimeS1);
        } else {
          this.fetchAnimeInfo(data, 1, false)
            .then((ai) => {
              if (
                currentShowinfoReqId !== this.siReqId ||
                this.currentView !== "showinfo" ||
                !this.currentShow ||
                String(this.currentShow.id) !== String(data.id)
              )
                return;
              if (ai) {
                animeInfo = ai;
                hasValidChain = true;
                applyAnimeMeta(ai);
              } else fallbackSingleAnime();
            })
            .catch(() => {
              if (
                currentShowinfoReqId !== this.siReqId ||
                this.currentView !== "showinfo" ||
                !this.currentShow ||
                String(this.currentShow.id) !== String(data.id)
              )
                return;
              fallbackSingleAnime();
            });
        }
      }
      if (trailerWrap) trailerWrap.style.display = "flex";
      if (trailerBtn && trailerBtn.dataset.hasTrailer === "1") {
        trailerBtn.style.display = "inline-flex";
      } else if (trailerBtn) {
        trailerBtn.style.display = "none";
      }
      const btn = this.$g("si-bookmark-btn");
      if (btn) {
        this.applySavedBtnState(
          btn,
          this.getSavedBtnInfo(id, true, data),
          true,
        );
        btn.style.display = "inline-flex";
      }
      const isReleased = data.is_anilist
        ? ["finished", "releasing", "ended", "released"].includes(
            status.toLowerCase(),
          )
        : type === "movie"
          ? status.toLowerCase() === "released"
          : [
              "released",
              "returning series",
              "in production",
              "ended",
              "canceled",
              "cancelled",
              "pilot",
            ].includes(status.toLowerCase()) || validSeasons.length > 0;
      if (!isReleased) lowerSeasonsReady = true;
      if (watchedBtn) {
        if (type === "movie" && !isReleased) {
          watchedBtn.style.display = "none";
        } else {
          watchedBtn.style.display = "inline-flex";
          this.updateWatchedBtnUI();
        }
      }
      const blockCurrentBtn = this.$g("si-block-btn");
      if (blockCurrentBtn) blockCurrentBtn.style.display = "inline-flex";
      const playBtn = this.$g("si-play-btn");
      const playWrap = this.$g("si-play-wrap");
      if (!isReleased) {
        if (playWrap) playWrap.style.display = "none";
        playBtn.style.display = "none";
      } else {
        if (playWrap) playWrap.style.display = "flex";
        playBtn.style.display = "inline-flex";
        if (type === "tv") {
          const seqChain =
            isAnimeShowMeta && !data.is_anilist
              ? cachedAnimeS1?.sequelChain ||
                animeInfo?.sequelChain ||
                this.getShowAnimeInfo(data.id)?.sequelChain ||
                null
              : this.getShowAnimeInfo(data.id)?.sequelChain ||
                animeInfo?.sequelChain ||
                null;
          const tmdbEpTotal =
            validSeasons[0]?.episode_count || data.number_of_episodes || 0;
          let cSeasons =
            hasValidChain &&
            seqChain &&
            seqChain.length > 0 &&
            validSeasons.length <= 1
              ? [...new Set(seqChain.map((s) => s.season || 1))]
              : null;
          if (cSeasons) {
            cSeasons.sort((a, b) => a - b);
            cSeasons = cSeasons.filter((sNum) => {
              if (sNum === 1) return true;
              if (!tmdbEpTotal) return true;
              for (let ep = 1; ep <= tmdbEpTotal; ep++) {
                if (this.resolveAnimeSequelEp(ep, seqChain).season === sNum)
                  return true;
              }
              return false;
            });
          }
          this.updateShowinfoPlayBtn();
          if (data.seasons && data.seasons.length > 0) {
            const sel = this.$g("si-season-select");
            const lastPlayedS = this.getLastPlayedSeason(data);
            const curRemembered =
              lastPlayedS !== null && lastPlayedS !== undefined
                ? lastPlayedS
                : parseInt(
                    this.showSeasons[id] || this.showSeasons[data.id],
                    10,
                  ) || 1;
            if (cSeasons && cSeasons.length > 0) {
              const animeSeasonItems = cSeasons.map((sNum) => {
                const entry = (seqChain || []).find(
                  (e) => (e.season || 1) === sNum,
                );
                const tmdbS = (data?.seasons || []).find(
                  (ts) => (ts.season_number || ts.season) == sNum,
                );
                const ep1Date =
                  this.episodeCache?.[`${data?.id}_s${sNum}`]?.episodes?.[0]
                    ?.air_date ||
                  tmdbS?.episodes?.[0]?.air_date ||
                  null;
                const validBSeasons = new Set([
                  "WINTER",
                  "SPRING",
                  "SUMMER",
                  "FALL",
                ]);
                const entryDate = entry?.startDate?.year
                  ? `${entry.startDate.year}-${String(entry.startDate.month || 1).padStart(2, "0")}-${String(entry.startDate.day || 1).padStart(2, "0")}`
                  : null;
                return {
                  season_number: sNum,
                  name: `Season ${sNum}`,
                  poster_path: entry?.poster_path || tmdbS?.poster_path || "",
                  startDate: entry?.startDate || null,
                  season:
                    entry?.broadcastSeason ||
                    (entry?.season &&
                    validBSeasons.has(String(entry.season).toUpperCase())
                      ? entry.season
                      : null),
                  seasonYear:
                    entry?.seasonYear || entry?.startDate?.year || null,
                  air_date:
                    entry?.air_date ||
                    entryDate ||
                    (sNum === 1 ? ep1Date : tmdbS?.air_date) ||
                    null,
                };
              });
              this.currentShowSeasonList = animeSeasonItems;
              const targetSeason = cSeasons.includes(curRemembered)
                ? curRemembered
                : cSeasons[0];
              if (sel) {
                sel.innerHTML = cSeasons
                  .map((s) => `<option value="${s}">Season ${s}</option>`)
                  .join("");
                sel.value = targetSeason;
                sel.style.display = "none";
              }
              this.renderSeasonCards(animeSeasonItems, targetSeason, data);
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  targetSeason,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  (seasonsSec && !this.$g("si-lower-loader")?.style) ||
                  this.$g("si-lower-loader")?.style.display === "none"
                )
                  seasonsSec.style.display = "block";
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
              this.fetchSeasonEpisodes(
                data.id,
                validSeasons[0]?.season_number || 1,
              ).catch(() => {});
            } else if (validSeasons.length > 1) {
              if (
                isAnimeShowMeta &&
                !data.is_anilist &&
                !hasValidChain &&
                !animeInfo &&
                !scrollToEpisodes
              ) {
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                const seasonsHeader = this.$g("si-seasons-header");
                if (seasonsHeader) seasonsHeader.style.display = "none";
                this.animeDotsTimer = setTimeout(() => {
                  if (
                    currentShowinfoReqId === this.siReqId &&
                    this.currentView === "showinfo" &&
                    this.currentShow?.id === data.id &&
                    !lowerSeasonsReady
                  ) {
                    this.currentShowSeasonList = validSeasons;
                    const sHdr = this.$g("si-seasons-header");
                    if (sHdr) sHdr.style.display = "";
                    this.renderSeasonCards(
                      validSeasons,
                      validSeasons[0]?.season_number || 1,
                      data,
                    );
                    const seasonsSec = this.$g("si-seasons-section");
                    if (
                      seasonsSec &&
                      (!this.$g("si-lower-loader")?.style ||
                        this.$g("si-lower-loader")?.style.display === "none")
                    )
                      seasonsSec.style.display = "block";
                    lowerSeasonsReady = true;
                    checkLowerReady();
                  }
                }, 7500);
              } else {
                const initHybrid =
                  hasValidChain &&
                  seqChain &&
                  seqChain.length > validSeasons.length
                    ? cachedAnimeS1?.hybridSeasonList ||
                      this.buildHybridSeasonList(validSeasons, seqChain, data)
                    : null;
                const seasonItemsToUse =
                  initHybrid && initHybrid.length > validSeasons.length
                    ? initHybrid
                    : validSeasons;
                if (initHybrid && initHybrid.length > validSeasons.length) {
                  const sVal = this.$g("si-seasons-val");
                  if (sVal) sVal.textContent = validSeasons.length;
                }
                this.currentShowSeasonList = seasonItemsToUse;
                let targetSeason = seasonItemsToUse[0]?.season_number || 1;
                if (
                  seasonItemsToUse.find((s) => s.season_number == curRemembered)
                )
                  targetSeason = curRemembered;
                if (sel) {
                  sel.innerHTML = seasonItemsToUse
                    .map(
                      (s) =>
                        `<option value="${s.season_number}">${s.name}</option>`,
                    )
                    .join("");
                  sel.value = targetSeason;
                  sel.style.display = "none";
                }
                this.renderSeasonCards(seasonItemsToUse, targetSeason, data);
                if (scrollToEpisodes) {
                  this.selectSeasonCard(
                    targetSeason,
                    scrollToEpisodes,
                    showOverlay,
                  );
                } else {
                  const seasonsSec = this.$g("si-seasons-section");
                  if (
                    (seasonsSec && !this.$g("si-lower-loader")?.style) ||
                    this.$g("si-lower-loader")?.style.display === "none"
                  )
                    seasonsSec.style.display = "block";
                  const epSec = this.$g("si-episodes-section");
                  if (epSec) epSec.style.display = "none";
                  lowerSeasonsReady = true;
                  checkLowerReady();
                }
              }
            } else if (
              isAnimeShowMeta &&
              !data.is_anilist &&
              validSeasons.length <= 1 &&
              !animeInfo &&
              !hasValidChain
            ) {
              const epSec = this.$g("si-episodes-section");
              if (epSec) epSec.style.display = "none";
              const seasonsHeader = this.$g("si-seasons-header");
              if (seasonsHeader) seasonsHeader.style.display = "none";
              this.animeDotsTimer = setTimeout(() => {
                if (
                  currentShowinfoReqId === this.siReqId &&
                  this.currentView === "showinfo" &&
                  this.currentShow?.id === data.id &&
                  !lowerSeasonsReady
                ) {
                  if (typeof fallbackSingleAnime === "function")
                    fallbackSingleAnime();
                }
              }, 7500);
            } else {
              this.currentShowSeasonList = validSeasons;
              const singleSeason =
                validSeasons[0]?.season_number ||
                data.seasons.find((s) => s.season_number > 0)?.season_number ||
                1;
              if (sel) {
                sel.innerHTML = validSeasons
                  .map(
                    (s) =>
                      `<option value="${s.season_number}">${s.name}</option>`,
                  )
                  .join("");
                sel.value = singleSeason;
                sel.style.display = "none";
              }
              this.renderSeasonCards(validSeasons, singleSeason, data);
              if (scrollToEpisodes) {
                this.selectSeasonCard(
                  singleSeason,
                  scrollToEpisodes,
                  showOverlay,
                );
              } else {
                const seasonsSec = this.$g("si-seasons-section");
                if (
                  seasonsSec &&
                  (!this.$g("si-lower-loader")?.style ||
                    this.$g("si-lower-loader")?.style.display === "none")
                )
                  seasonsSec.style.display = "block";
                const epSec = this.$g("si-episodes-section");
                if (epSec) epSec.style.display = "none";
                lowerSeasonsReady = true;
                checkLowerReady();
              }
              this.fetchSeasonEpisodes(data.id, singleSeason).catch(() => {});
            }
          } else {
            lowerSeasonsReady = true;
            checkLowerReady();
          }
        } else if (type === "movie") {
          this.updateShowinfoPlayBtn();
        }
      }
      const mSec = this.$g("si-media-section");
      const isAni =
        (typeof id === "string" && id.startsWith("ani_")) ||
        String(data.id).startsWith("ani_") ||
        !!data.is_anilist ||
        (typeof resolvedId === "string" && resolvedId.startsWith("ani_"));
      if (isAni) {
        showMediaPlanned = false;
        if (mSec) mSec.style.display = "none";
      } else {
        this.movieMediaState.active = false;
        const triggerWrap = this.$g("si-media-trigger-wrap");
        const triggerImg = this.$g("si-media-trigger-img");
        const mediaGrid = this.$g("si-media-grid");
        const navControls = this.$g("si-media-nav-controls");
        const closeBtn = this.$g("si-gallery-close-btn");
        const initGalleryTrigger = () => {
          showMediaPlanned = true;
          const loader = this.$g("si-lower-loader");
          const isLowerLoading = loader && loader.style.display !== "none";
          if (mSec && !isLowerLoading) mSec.style.display = "block";
          if (triggerWrap) triggerWrap.style.display = "grid";
          if (mediaGrid) mediaGrid.style.display = "none";
          if (navControls) navControls.style.display = "none";
          if (closeBtn) closeBtn.style.display = "none";
          if (triggerImg) {
            triggerImg.classList.remove("loaded");
            triggerImg.onload = () => triggerImg.classList.add("loaded");
            let chosenPath = null;
            let chosenType = "backdrop";
            const backdrops = data.images?.backdrops || [];
            const posters = data.images?.posters || [];
            const titleBackdrop = backdrops.find(
              (b) => b.file_path && b.iso_639_1 && b.iso_639_1 !== "xx",
            );
            const titlePoster = posters.find(
              (p) => p.file_path && p.iso_639_1 && p.iso_639_1 !== "xx",
            );
            if (titleBackdrop?.file_path) {
              chosenPath = titleBackdrop.file_path;
              chosenType = "backdrop";
            } else if (titlePoster?.file_path) {
              chosenPath = titlePoster.file_path;
              chosenType = "poster";
            } else if (data.backdrop_path) {
              chosenPath = data.backdrop_path;
              chosenType = "backdrop";
            } else if (backdrops[0]?.file_path) {
              chosenPath = backdrops[0].file_path;
              chosenType = "backdrop";
            } else if (data.poster_path) {
              chosenPath = data.poster_path;
              chosenType = "poster";
            } else if (posters[0]?.file_path) {
              chosenPath = posters[0].file_path;
              chosenType = "poster";
            }
            if (chosenPath) {
              triggerImg.src = this.getImg(chosenPath, chosenType);
              if (triggerImg.complete && triggerImg.naturalWidth > 0)
                triggerImg.classList.add("loaded");
              triggerImg.style.display = "block";
            } else {
              triggerImg.style.display = "none";
            }
          }
        };
        const hasTmdbMedia =
          (data.images &&
            (data.images.backdrops?.length || 0) +
              (data.images.posters?.length || 0) >
              0) ||
          (data.backdrop_path &&
            typeof data.backdrop_path === "string" &&
            data.backdrop_path.startsWith("/")) ||
          (data.poster_path &&
            typeof data.poster_path === "string" &&
            data.poster_path.startsWith("/"));
        if (hasTmdbMedia) {
          initGalleryTrigger();
        } else {
          if (mSec) mSec.style.display = "none";
          this.fetchMovieMedia(data)
            .then((items) => {
              if (
                currentShowinfoReqId !== this.siReqId ||
                this.currentView !== "showinfo"
              )
                return;
              if (items && items.length > 0) {
                initGalleryTrigger();
              } else if (mSec) {
                showMediaPlanned = false;
                mSec.style.display = "none";
              }
            })
            .catch(() => {
              if (currentShowinfoReqId === this.siReqId) {
                showMediaPlanned = false;
                if (mSec) mSec.style.display = "none";
              }
            });
        }
      }
      let simItems = [];
      try {
        simItems = ((await simPromise) || []).slice(0, 15);
      } catch (e) {
        simItems = [];
      }
      if (simItems.length === 0) {
        if (isAnimeShowMeta || this.isAnimeItem(data)) {
          try {
            const aniGql = `query { Page(page: 1, perPage: 15) { media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { id idMal format title { romaji english userPreferred } coverImage { extraLarge large } genres startDate { year } averageScore } } }`;
            const aniPop = await this.aniApi(aniGql);
            simItems = (aniPop?.data?.Page?.media || [])
              .map((m) => this.toAniCard(m, type === "movie"))
              .filter(Boolean)
              .slice(0, 12);
          } catch (e) {}
        }
        if (simItems.length === 0 && !data.is_anilist) {
          const popRes = await this.api(`/discover/${type}`, {
            sort_by: "popularity.desc",
          });
          simItems = (popRes?.results || [])
            .filter(
              (i) => !this.isBlocked(i, type) && String(i.id) !== String(id),
            )
            .slice(0, 10);
        }
      }
      const showCast =
        Array.isArray(data.credits?.cast) && data.credits.cast.length > 0;
      const targetCastId =
        typeof resolvedId === "number" ||
        (typeof resolvedId === "string" && !resolvedId.startsWith("ani_"))
          ? resolvedId
          : data.id && !String(data.id).startsWith("ani_")
            ? data.id
            : null;
      const castSec = this.$g("si-cast-section");
      if (castSec) {
        if (showCast || targetCastId) {
          const isAnimShow = Boolean(
            isAnimeShowMeta ||
            this.isAnimeItem(data) ||
            data.is_anime ||
            (data.genre_ids && data.genre_ids.includes(16)) ||
            (data.genres &&
              data.genres.some((g) =>
                typeof g === "object" && g
                  ? g.id === 16 ||
                    (g.name && String(g.name).toLowerCase().includes("anim"))
                  : g === 16 || String(g).toLowerCase().includes("anim"),
              )),
          );
          const isAnimeShow = Boolean(
            isAnimeShowMeta || this.isAnimeItem(data) || data.is_anilist,
          );
          if (
            targetCastId &&
            (!data.credits?.cast || data.credits.cast.length < 25)
          ) {
            const creditsEp =
              type === "tv"
                ? `/${type}/${targetCastId}/aggregate_credits`
                : `/${type}/${targetCastId}/credits`;
            this.api(creditsEp, {}, this.getTmdbMediaKey())
              .then((cRes) => {
                let castList = cRes?.cast;
                if (!castList || castList.length === 0) {
                  if (type === "tv") {
                    return this.api(
                      `/tv/${targetCastId}/credits`,
                      {},
                      this.getTmdbMediaKey(),
                    )
                      .then((c2) => {
                        if (
                          c2?.cast?.length > 0 &&
                          this.currentShow?.id === data.id &&
                          currentShowinfoReqId === this.siReqId
                        ) {
                          data.credits.cast = c2.cast
                            .slice(0, 60)
                            .map((c) => ({
                              id: c.id,
                              name: c.name,
                              character: c.character || "",
                              profile_path: c.profile_path,
                            }));
                          this.renderCastSection(data, isAnimeShow);
                          showCastPlanned = true;
                        } else if (
                          data.credits?.cast?.length > 0 &&
                          this.currentShow?.id === data.id &&
                          currentShowinfoReqId === this.siReqId
                        ) {
                          this.renderCastSection(data, isAnimeShow);
                          showCastPlanned = true;
                        } else if (
                          this.currentShow?.id === data.id &&
                          currentShowinfoReqId === this.siReqId
                        ) {
                          showCastPlanned = false;
                          castSec.style.display = "none";
                        }
                        lowerCastReady = true;
                        checkLowerReady();
                      })
                      .catch(() => {
                        if (
                          this.currentShow?.id === data.id &&
                          currentShowinfoReqId === this.siReqId
                        ) {
                          if (data.credits?.cast?.length > 0) {
                            this.renderCastSection(data, isAnimeShow);
                            showCastPlanned = true;
                          } else {
                            showCastPlanned = false;
                            castSec.style.display = "none";
                          }
                        }
                        lowerCastReady = true;
                        checkLowerReady();
                      });
                  } else if (
                    this.currentShow?.id === data.id &&
                    currentShowinfoReqId === this.siReqId
                  ) {
                    if (data.credits?.cast?.length > 0) {
                      this.renderCastSection(data, isAnimeShow);
                      showCastPlanned = true;
                    } else {
                      showCastPlanned = false;
                      castSec.style.display = "none";
                    }
                    lowerCastReady = true;
                    checkLowerReady();
                  }
                } else if (
                  this.currentShow?.id === data.id &&
                  currentShowinfoReqId === this.siReqId
                ) {
                  data.credits.cast = castList.slice(0, 60).map((c) => ({
                    id: c.id,
                    name: c.name,
                    character:
                      Array.isArray(c.roles) && c.roles.length > 0
                        ? c.roles
                            .map((r) => r.character)
                            .filter(Boolean)
                            .join(" / ")
                        : c.character || "",
                    profile_path: c.profile_path,
                  }));
                  this.renderCastSection(data, isAnimeShow);
                  showCastPlanned = true;
                  lowerCastReady = true;
                  checkLowerReady();
                }
              })
              .catch(() => {
                if (
                  this.currentShow?.id === data.id &&
                  currentShowinfoReqId === this.siReqId
                ) {
                  if (data.credits?.cast?.length > 0) {
                    this.renderCastSection(data, isAnimeShow);
                    showCastPlanned = true;
                  } else {
                    showCastPlanned = false;
                    castSec.style.display = "none";
                  }
                }
                lowerCastReady = true;
                checkLowerReady();
              });
          } else if (showCast) {
            this.renderCastSection(data, isAnimeShow);
            showCastPlanned = true;
            lowerCastReady = true;
            checkLowerReady();
          } else {
            showCastPlanned = false;
            castSec.style.display = "none";
            lowerCastReady = true;
            checkLowerReady();
          }
        } else {
          showCastPlanned = false;
          castSec.style.display = "none";
          lowerCastReady = true;
          checkLowerReady();
        }
      } else {
        lowerCastReady = true;
        checkLowerReady();
      }
      const showSim = !this.uiPrefs || this.uiPrefs.similarShowcase !== false;
      if (showSim && simItems.length > 0) {
        const simTitleEl = this.$g("si-similar-title");
        if (simTitleEl) {
          const simLabel =
            this.isAnimeItem(data) || String(id).startsWith("ani_")
              ? "Similar Anime"
              : type === "movie"
                ? "Similar Movies"
                : "Similar Shows";
          simTitleEl.innerHTML = `<span>${simLabel}</span><span class="section-nav-icon">${EXPAND_RIGHT_SVG(18, 18)}</span>`;
          const currentTitle =
            data.title || data.name || (type === "movie" ? "Movie" : "Show");
          simTitleEl.onclick = () =>
            app.openMoreSimilar(id, type, currentTitle, data);
        }
        const simRow = this.$g("si-similar-row");
        if (simRow) {
          if (
            typeof this.enrichAnimeTmdbPosters === "function" &&
            simItems.some((i) => i && String(i.id).startsWith("ani_"))
          ) {
            await this.enrichAnimeTmdbPosters(simItems);
            if (currentShowinfoReqId !== this.siReqId) return;
          }
          simRow.innerHTML = simItems
            .map((i) => this.buildCard(i, i.media_type || type))
            .join("");
          simRow.scrollTo({ left: 0, behavior: "instant" });
          simRow.scrollLeft = 0;
          requestAnimationFrame(() => {
            if (simRow) {
              simRow.scrollLeft = 0;
              if (typeof this.checkScrollArrow === "function")
                this.checkScrollArrow(simRow);
            }
          });
          if (typeof this.checkScrollArrow === "function")
            this.checkScrollArrow(simRow);
          this.markImgsLoaded(simRow.querySelectorAll("img"));
        }
        if (simSec) {
          simSec.style.marginTop = "";
          showSimPlanned = true;
        }
      } else {
        showSimPlanned = false;
        if (simSec) {
          simSec.style.marginTop = "";
          simSec.style.display = "none";
        }
      }
      lowerSimReady = true;
      checkLowerReady();
      setTimeout(() => this.updateArrows(), 150);
    } catch (err) {
      console.error(err);
      if (currentShowinfoReqId === this.siReqId) {
        this.$display(["si-initial-loader", "si-lower-loader"], "none");
        this.hidePageReloadOverlay();
        this.stopLoader();
      }
    }
  },
  navigateCastRow: function (direction) {
    const row = this.$g("si-cast-row");
    if (!row) return;
    const scrollAmount = row.clientWidth * 0.75 * direction;
    row.scrollBy({ left: scrollAmount, behavior: "smooth" });
  },
  toggleCastViewMode: function () {
    const currentMode = this.castViewMode || "min";
    const newMode = currentMode === "min" ? "pic" : "min";
    this.castViewMode = newMode;
    if (this.uiPrefs) delete this.uiPrefs.castViewMode;
    this.updateCastTitleUI();
    const row = this.$g("si-cast-row");
    if (row) {
      row.classList.remove("slide-down", "slide-up");
      void row.offsetWidth;
      row.classList.add(newMode === "pic" ? "slide-down" : "slide-up");
      setTimeout(() => {
        if (row) row.classList.remove("slide-down", "slide-up");
      }, 320);
    }
    const castSec = this.$g("si-cast-section");
    this.animateHeight(castSec, () => {
      if (this.currentShow) {
        const isAnimShow = Boolean(
          this.currentShow.isAnime ||
          (this.isAnimeItem && this.isAnimeItem(this.currentShow)) ||
          this.currentShow.is_anime ||
          (this.currentShow.genre_ids &&
            this.currentShow.genre_ids.includes(16)) ||
          (this.currentShow.genres &&
            this.currentShow.genres.some((g) =>
              typeof g === "object" && g
                ? g.id === 16 ||
                  (g.name && String(g.name).toLowerCase().includes("anim"))
                : g === 16 || String(g).toLowerCase().includes("anim"),
            )),
        );
        const isAnimeShow = Boolean(
          this.currentShow.isAnime ||
          (this.isAnimeItem && this.isAnimeItem(this.currentShow)) ||
          this.currentShow.is_anilist,
        );
        this.renderCastSection(this.currentShow, isAnimeShow);
      }
    });
  },
  fetchAniCharacters: async function (aniId) {
    if (!aniId) return null;
    if (!this.animeCache) this.animeCache = {};
    const cacheKey = `ani_${aniId}_chars_v2`;
    if (this.animeCache[cacheKey]) return this.animeCache[cacheKey];
    try {
      const charFrag = `edges { role node { id name { full userPreferred first last native alternative } image { large medium } } voiceActors(language: JAPANESE) { id name { full userPreferred native } } }`;
      const gql = `query ($id: Int) { Media(id: $id) { p1: characters(sort: [ROLE, RELEVANCE, ID], page: 1, perPage: 25) { ${charFrag} } p2: characters(sort: [ROLE, RELEVANCE, ID], page: 2, perPage: 25) { ${charFrag} } p3: characters(sort: [ROLE, RELEVANCE, ID], page: 3, perPage: 25) { ${charFrag} } p4: characters(sort: [ROLE, RELEVANCE, ID], page: 4, perPage: 25) { ${charFrag} } relations { edges { relationType node { id type p1: characters(sort: [ROLE, RELEVANCE, ID], page: 1, perPage: 25) { ${charFrag} } p2: characters(sort: [ROLE, RELEVANCE, ID], page: 2, perPage: 25) { ${charFrag} } } } } } }`;
      const res = await this.aniApi(gql, { id: parseInt(aniId, 10) });
      const media = res?.data?.Media;
      if (!media) return null;
      const allEdges = [
        ...(media.p1?.edges || []),
        ...(media.p2?.edges || []),
        ...(media.p3?.edges || []),
        ...(media.p4?.edges || []),
      ];
      const relEdges = media.relations?.edges || [];
      relEdges.forEach((re) => {
        const rt = re?.relationType;
        const rn = re?.node;
        if (
          rn &&
          rn.type === "ANIME" &&
          ["SEQUEL", "PREQUEL", "SIDE_STORY", "PARENT", "ALTERNATIVE"].includes(
            rt,
          )
        ) {
          if (Array.isArray(rn.p1?.edges)) allEdges.push(...rn.p1.edges);
          if (Array.isArray(rn.p2?.edges)) allEdges.push(...rn.p2.edges);
        }
      });
      const byId = new Map();
      allEdges.forEach((e) => {
        const n = e?.node;
        if (!n || !n.id) return;
        const img = n.image?.large || n.image?.medium || "";
        if (!img || img.includes("default.jpg")) return;
        const roleRank =
          e.role === "MAIN" ? 3 : e.role === "SUPPORTING" ? 2 : 1;
        const existing = byId.get(n.id);
        const vaList = Array.isArray(e.voiceActors) ? e.voiceActors : [];
        if (!existing) {
          byId.set(n.id, {
            id: n.id,
            img,
            roleRank,
            full: n.name?.full || "",
            preferred: n.name?.userPreferred || "",
            first: n.name?.first || "",
            last: n.name?.last || "",
            native: n.name?.native || "",
            alts: Array.isArray(n.name?.alternative)
              ? n.name.alternative.filter(Boolean)
              : [],
            vas: vaList.map((v) => ({
              full: v?.name?.full || "",
              preferred: v?.name?.userPreferred || "",
              native: v?.name?.native || "",
            })),
          });
        } else {
          if (roleRank > existing.roleRank) existing.roleRank = roleRank;
          vaList.forEach((v) => {
            const vf = v?.name?.full || "";
            if (vf && !existing.vas.some((ev) => ev.full === vf)) {
              existing.vas.push({
                full: vf,
                preferred: v?.name?.userPreferred || "",
                native: v?.name?.native || "",
              });
            }
          });
        }
      });
      const charList = Array.from(byId.values());
      this.animeCache[cacheKey] = charList;
      return charList;
    } catch (e) {
      return null;
    }
  },
  updateCastTitleUI: function () {
    const el = this.$g("si-cast-title");
    if (!el) return;
    const isExp = (this.castViewMode || "min") === "pic";
    const isTv = Boolean(
      this.currentShow &&
      (this.currentShow.media_type === "tv" ||
        this.currentShow.type === "tv" ||
        (!this.currentShow.title && this.currentShow.name)),
    );
    const label = isTv ? "Top Cast" : "Cast";
    let iconSpan = el.querySelector(".si-cast-toggle-icon");
    if (!iconSpan) {
      el.innerHTML =
        "<span>" +
        label +
        '</span><span class="si-cast-toggle-icon">' +
        EXPAND_DOWN_SVG(18, 18) +
        "</span>";
    } else if (
      el.firstElementChild &&
      el.firstElementChild.tagName === "SPAN"
    ) {
      el.firstElementChild.textContent = label;
    }
    el.classList.toggle("is-expanded", isExp);
  },
  renderCastSection: function (showData, isAnime = false) {
    this.updateCastTitleUI();
    const row = this.$g("si-cast-row");
    if (!row || !showData || !Array.isArray(showData.credits?.cast)) return;
    const castList = showData.credits.cast;
    if (castList.length === 0) return;
    const mode = this.castViewMode || "min";
    row.className = "scroll-row si-cast-row mode-" + mode;
    const isAnimation = Boolean(
      isAnime ||
      showData.isAnime ||
      showData.is_anime ||
      (showData.genre_ids && showData.genre_ids.includes(16)) ||
      (showData.genres &&
        showData.genres.some((g) =>
          typeof g === "object" && g
            ? g.id === 16 ||
              (g.name && String(g.name).toLowerCase().includes("anim"))
            : g === 16 || String(g).toLowerCase().includes("anim"),
        )),
    );
    const renderCards = (aniCharMap = null) => {
      const aggCast = showData.aggregate_credits?.cast;
      const cardsHtml = castList
        .map((c) => {
          const name = c.name || "";
          let role = "";
          const cleanLiveChar = (s) =>
            String(s || "")
              .split(/\s*\/\s*/)[0]
              .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
              .trim();
          const cleanAnimChar = (s) =>
            String(s || "")
              .replace(/\s*\((?:[^)]*voice[^)]*)\)/gi, "")
              .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
              .trim();
          const rolesArr =
            Array.isArray(c.roles) && c.roles.length > 0
              ? c.roles
              : Array.isArray(aggCast)
                ? aggCast.find((ac) => ac.id === c.id)?.roles
                : null;
          if (Array.isArray(rolesArr) && rolesArr.length > 0) {
            const sorted = [...rolesArr].sort(
              (a, b) => (b.episode_count || 0) - (a.episode_count || 0),
            );
            if (!isAnimation) {
              role = cleanLiveChar(sorted[0]?.character || c.character);
            } else {
              const maxEp = sorted[0]?.episode_count || 0;
              const threshold = Math.max(4, Math.round(maxEp * 0.45));
              const qualRoles = sorted.filter(
                (r, idx) => idx === 0 || (r.episode_count || 0) >= threshold,
              );
              const seen = new Set();
              const parts = [];
              for (const r of qualRoles) {
                const rawTokens = String(r.character || "").split(/\s*\/\s*/);
                for (const token of rawTokens) {
                  const ch = cleanAnimChar(token);
                  const norm = ch.toLowerCase();
                  if (ch && !seen.has(norm)) {
                    seen.add(norm);
                    parts.push(ch);
                  }
                }
              }
              role = parts.join(" / ");
            }
          } else {
            if (!isAnimation) {
              role = cleanLiveChar(c.character);
            } else {
              const rawTokens = String(c.character || "").split(/\s*\/\s*/);
              const seen = new Set();
              const parts = [];
              for (const token of rawTokens) {
                const ch = cleanAnimChar(token);
                const norm = ch.toLowerCase();
                if (ch && !seen.has(norm)) {
                  seen.add(norm);
                  parts.push(ch);
                }
              }
              role = parts.join(" / ");
            }
          }
          let imgUrl = "";
          if (mode === "pic") {
            if (isAnime && Array.isArray(aniCharMap) && aniCharMap.length > 0) {
              const normRomaji = (str) =>
                String(str || "")
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/uu/g, "u")
                  .replace(/ou|oo|oh/g, "o")
                  .replace(/ii/g, "i")
                  .replace(/ee/g, "e")
                  .replace(/aa/g, "a")
                  .replace(/sy/g, "sh")
                  .replace(/ty/g, "ch")
                  .replace(/zy/g, "j")
                  .replace(/tu/g, "tsu")
                  .replace(/ti/g, "chi")
                  .replace(/si/g, "shi")
                  .replace(/hu/g, "fu")
                  .replace(/l/g, "r")
                  .replace(/[^a-z0-9\s]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
              const genericWords = new Set([
                "the",
                "and",
                "with",
                "for",
                "from",
                "voice",
                "voices",
                "additional",
                "young",
                "child",
                "children",
                "kid",
                "kids",
                "baby",
                "boy",
                "girl",
                "man",
                "woman",
                "men",
                "women",
                "old",
                "villager",
                "villagers",
                "citizen",
                "citizens",
                "townsperson",
                "student",
                "students",
                "teacher",
                "soldier",
                "soldiers",
                "guard",
                "guards",
                "knight",
                "knights",
                "maid",
                "maids",
                "servant",
                "servants",
                "narrator",
                "announcer",
                "reporter",
                "customer",
                "clerk",
                "shopkeeper",
                "owner",
                "stall",
                "street",
                "member",
                "subordinate",
                "thug",
                "bandit",
                "pirate",
                "ninja",
                "shinobi",
                "doctor",
                "nurse",
                "police",
                "officer",
                "driver",
                "pilot",
                "captain",
                "commander",
                "general",
                "lord",
                "king",
                "queen",
                "prince",
                "princess",
                "spirit",
                "artificial",
                "witch",
                "demon",
                "monster",
                "clone",
                "part",
                "ep",
                "episode",
              ]);
              const actorNorm = normRomaji(name);
              const actorTokens = actorNorm
                .split(" ")
                .filter((t) => t.length >= 2);
              const actorKey1 = actorTokens.join(" ");
              const actorKey2 = [...actorTokens].reverse().join(" ");
              const rawSegments = [];
              String(role || "")
                .split(/\s*\/\s*/)
                .forEach((seg) => {
                  const noParen = seg.replace(/\s*\([^)]*\)/g, "").trim();
                  if (noParen) rawSegments.push(noParen);
                  const parenMatches = seg.match(/\(([^)]+)\)/g);
                  if (parenMatches) {
                    parenMatches.forEach((pm) => {
                      const inner = pm.slice(1, -1).trim();
                      if (
                        inner &&
                        !/^(?:voice|uncredited|artificial spirit|young|child|ep\b)/i.test(
                          inner,
                        )
                      )
                        rawSegments.push(inner);
                    });
                  }
                });
              const roleSegments = rawSegments
                .map((s) => {
                  const n = normRomaji(s);
                  const tokens = n
                    .split(" ")
                    .filter((t) => t.length >= 2 && !genericWords.has(t));
                  return {
                    raw: n,
                    joined: tokens.join(" "),
                    revJoined: [...tokens].reverse().join(" "),
                    tokens,
                  };
                })
                .filter((s) => s.tokens.length > 0);
              let bestChar = null;
              let bestScore = 0;
              for (const ch of aniCharMap) {
                let vaMatched = false;
                if (actorTokens.length >= 2 && Array.isArray(ch.vas)) {
                  for (const va of ch.vas) {
                    const vn = normRomaji(va.full || va.preferred);
                    if (vn && (vn === actorKey1 || vn === actorKey2)) {
                      vaMatched = true;
                      break;
                    }
                  }
                }
                const primaryRaw = [
                  ch.full,
                  ch.preferred,
                  ch.first && ch.last ? ch.last + " " + ch.first : "",
                ].filter(Boolean);
                const primaryNorms = primaryRaw
                  .map((p) => {
                    const n = normRomaji(p);
                    const tokens = n.split(" ").filter(Boolean);
                    return {
                      joined: tokens.join(" "),
                      revJoined: [...tokens].reverse().join(" "),
                      tokens,
                    };
                  })
                  .filter((p) => p.tokens.length > 0);
                const altNorms = (ch.alts || [])
                  .map((a) => {
                    const n = normRomaji(a);
                    const tokens = n.split(" ").filter(Boolean);
                    return { joined: tokens.join(" "), tokens };
                  })
                  .filter(
                    (a) =>
                      a.joined.length >= 4 &&
                      a.tokens.some((t) => !genericWords.has(t)),
                  );
                let nameScore = 0;
                for (const seg of roleSegments) {
                  for (const pn of primaryNorms) {
                    if (
                      seg.joined === pn.joined ||
                      seg.joined === pn.revJoined ||
                      seg.revJoined === pn.joined
                    ) {
                      nameScore = Math.max(nameScore, 100);
                    } else if (
                      pn.tokens.length === 1 &&
                      pn.tokens[0].length >= 4 &&
                      seg.tokens.includes(pn.tokens[0])
                    ) {
                      nameScore = Math.max(nameScore, 90);
                    } else if (
                      seg.tokens.length === 1 &&
                      seg.tokens[0].length >= 4 &&
                      pn.tokens.includes(seg.tokens[0])
                    ) {
                      nameScore = Math.max(nameScore, vaMatched ? 92 : 82);
                    } else if (
                      seg.tokens.length >= 2 &&
                      pn.tokens.length >= 2
                    ) {
                      const shared = seg.tokens.filter(
                        (t) => t.length >= 3 && pn.tokens.includes(t),
                      );
                      if (shared.length >= 2) {
                        nameScore = Math.max(nameScore, 94);
                      } else if (
                        shared.length === 1 &&
                        (vaMatched || shared[0].length >= 5)
                      ) {
                        nameScore = Math.max(nameScore, vaMatched ? 88 : 74);
                      }
                    }
                  }
                  if (nameScore < 85) {
                    for (const an of altNorms) {
                      if (seg.joined === an.joined) {
                        nameScore = Math.max(nameScore, 85);
                      } else if (
                        an.tokens.length >= 2 &&
                        seg.tokens.filter(
                          (t) => t.length >= 3 && an.tokens.includes(t),
                        ).length >= 2
                      ) {
                        nameScore = Math.max(nameScore, 80);
                      }
                    }
                  }
                }
                let totalScore = nameScore;
                if (vaMatched && nameScore >= 70) {
                  totalScore += 50;
                } else if (
                  vaMatched &&
                  nameScore === 0 &&
                  roleSegments.length > 0
                ) {
                  const vaCharCount = aniCharMap.filter(
                    (other) =>
                      Array.isArray(other.vas) &&
                      other.vas.some((v) => {
                        const vn = normRomaji(v.full || v.preferred);
                        return vn === actorKey1 || vn === actorKey2;
                      }),
                  ).length;
                  if (vaCharCount === 1 && ch.roleRank >= 2) {
                    totalScore = 72;
                  }
                }
                if (totalScore > 0) totalScore += ch.roleRank || 1;
                if (totalScore > bestScore) {
                  bestScore = totalScore;
                  bestChar = ch;
                }
              }
              if (bestChar && bestScore >= 72) {
                imgUrl = bestChar.img;
              }
            }
            if (!imgUrl && !isAnime && c.profile_path) {
              const pPath = String(c.profile_path).startsWith("/")
                ? c.profile_path
                : "/" + c.profile_path;
              imgUrl = IMG_BASE + "w185" + pPath;
            }
          }
          const noPicSvg = CAST_PLACEHOLDER_SVG;
          const imgHtml =
            mode === "pic"
              ? '<div class="si-cast-img-wrap">' +
                noPicSvg +
                (imgUrl
                  ? '<img class="si-cast-img" src="' +
                    imgUrl +
                    '" onload="this.classList.add(\'loaded\')" onerror="this.style.display=\'none\'" />'
                  : "") +
                "</div>"
              : "";
          const clickAttr = c.id
            ? ' onclick="app.openPerson(' + c.id + ')"'
            : "";
          return (
            '<div class="si-cast-card"' +
            clickAttr +
            ">" +
            imgHtml +
            '<div class="si-cast-meta"><div class="si-cast-name" title="' +
            name +
            '">' +
            name +
            '</div><div class="si-cast-role" title="' +
            role +
            '">' +
            role +
            "</div></div></div>"
          );
        })
        .join("");
      row.innerHTML = cardsHtml;
      row.scrollLeft = 0;
      if (typeof this.checkScrollArrow === "function")
        this.checkScrollArrow(row);
      requestAnimationFrame(() => {
        if (row) {
          row.scrollLeft = 0;
          if (typeof this.checkScrollArrow === "function")
            this.checkScrollArrow(row);
        }
      });
      this.markImgsLoaded(row.querySelectorAll("img"));
    };
    renderCards(null);
    if (mode === "pic" && isAnime) {
      const aniId =
        showData.ani_id ||
        this.currentAnimeInfo?.aniId ||
        this.animeCache?.[String(showData.id)]?.aniId ||
        this.animeCache?.[`${showData.id}_s1`]?.aniId ||
        null;
      if (aniId) {
        this.fetchAniCharacters(aniId).then((map) => {
          if (
            map &&
            (this.castViewMode || "min") === "pic" &&
            this.currentShow?.id === showData.id
          ) {
            renderCards(map);
          }
        });
      }
    }
  },
  selectSeasonCard: function (
    seasonNum,
    autoScroll = true,
    showOverlay = false,
  ) {
    if (!this.currentShow) return;
    this.updateShowinfoPlayBtn();
    const hasSeasons = Boolean(
      this.currentShowSeasonList && this.currentShowSeasonList.length > 0,
    );
    if (!hasSeasons) {
      this.pendingSeasonAnchorScroll = false;
      this._needsSeasonAnchorAlign = false;
      if (autoScroll && showOverlay) {
        this.pendingScrollToEpisode = true;
        this.showSiScrollOverlay(true);
      }
      this.loadEpisodes(seasonNum);
      return;
    }
    const preClickY = this.getScrollY();
    const anchorY = this.getSeasonAnchorY();
    this._needsSeasonAnchorAlign = Boolean(autoScroll);
    if (this.siSeasonScrollTimer) {
      clearTimeout(this.siSeasonScrollTimer);
      this.siSeasonScrollTimer = null;
    }
    if (this.siAnchorScrollTimer) {
      clearTimeout(this.siAnchorScrollTimer);
      this.siAnchorScrollTimer = null;
    }
    if (this.siAnchorScrollTimer2) {
      clearTimeout(this.siAnchorScrollTimer2);
      this.siAnchorScrollTimer2 = null;
    }
    const sNum = parseInt(seasonNum, 10) || 1;
    this.showSeasons[this.currentShow.id] = sNum;
    this.$storeSet("showSeasons", this.showSeasons);
    const seasonsSec = this.$g("si-seasons-section");
    const isViewingSeasons = Boolean(
      seasonsSec && seasonsSec.style.display !== "none",
    );
    if (
      isViewingSeasons &&
      !showOverlay &&
      !this.scrollDownOnReturnToShowinfo
    ) {
      this.siSeasonScrollY = preClickY;
      if (!this.showSeasonScrollY) this.showSeasonScrollY = {};
      if (this.currentShow && this.currentShow.id) {
        this.showSeasonScrollY[this.currentShow.id] = preClickY;
      }
    } else if (
      (this.siSeasonScrollY === undefined || this.siSeasonScrollY === null) &&
      this.currentShow &&
      this.showSeasonScrollY &&
      this.showSeasonScrollY[this.currentShow.id] !== undefined
    ) {
      this.siSeasonScrollY = this.showSeasonScrollY[this.currentShow.id];
    }
    this.updateSeasonCardsHighlight();
    const prevSeasonH = seasonsSec ? seasonsSec.offsetHeight : 0;
    if (seasonsSec) seasonsSec.style.display = "none";
    const epSec = this.$g("si-episodes-section");
    if (epSec) {
      epSec.style.display = "block";
      if (prevSeasonH > 0) epSec.style.minHeight = prevSeasonH + "px";
    }
    const epGrid = this.$g("si-ep-grid");
    if (epGrid)
      epGrid.innerHTML =
        '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    const epPag = this.$g("si-ep-pagination");
    if (epPag) epPag.innerHTML = "";
    const backBtn = this.$g("si-back-to-seasons");
    if (backBtn)
      backBtn.style.display =
        this.currentShowSeasonList && this.currentShowSeasonList.length > 0
          ? "inline-flex"
          : "none";
    if (this.currentShowSeasonList && this.currentShowSeasonList.length > 1) {
      const sObj = this.currentShowSeasonList.find(
        (s) => (s.season_number || s.season || s) == sNum,
      );
      this.setEpHeading(
        sObj ? sObj.name || `Season ${sNum}` : `Season ${sNum}`,
      );
    } else {
      this.setEpHeading("Episodes");
    }
    const sel = this.$g("si-season-select");
    if (sel) {
      sel.value = sNum;
      sel.style.display = "none";
    }
    if (this.currentShowSeasonList && this.currentShowSeasonList.length > 0) {
      if (this._skipEpHistoryPush) {
        this._skipEpHistoryPush = false;
        window.history.replaceState(
          {
            view: "showinfo",
            id: this.currentShow.id,
            type: this.currentShow.media_type || "tv",
            sub: "episodes",
            season: sNum,
          },
          document.title,
          window.location.href,
        );
      } else if (
        !window.history.state ||
        window.history.state.sub !== "episodes" ||
        window.history.state.season !== sNum
      ) {
        window.history.pushState(
          {
            view: "showinfo",
            id: this.currentShow.id,
            type: this.currentShow.media_type || "tv",
            sub: "episodes",
            season: sNum,
          },
          document.title,
          window.location.href,
        );
      }
    }
    if (autoScroll && showOverlay) {
      this.pendingScrollToEpisode = true;
      this.pendingSeasonAnchorScroll = false;
      this._needsSeasonAnchorAlign = false;
      this.showSiScrollOverlay(true);
    } else {
      this.pendingScrollToEpisode = false;
      this.pendingSeasonAnchorScroll = Boolean(autoScroll);
      this._needsSeasonAnchorAlign = Boolean(autoScroll);
      if (this.pendingSeasonAnchorScroll) this.alignToSeasonAnchor(true);
    }
    this.pendingScrollToEpTop = false;
    this.loadEpisodes(sNum);
  },
  getSeasonAnchorY: function () {
    const tr = this.$g("si-media-section");
    const desc = this.$g("si-gap-section");
    const target =
      desc && desc.offsetParent !== null && desc.offsetHeight > 0 ? desc : tr;
    if (!target) return 260;
    let y = 0;
    let el = target;
    while (el) {
      y += el.offsetTop || 0;
      el = el.offsetParent;
    }
    return Math.max(0, y - 12);
  },
  alignToSeasonAnchor: function (force = false) {
    const hasSeasons = Boolean(
      this.currentShowSeasonList && this.currentShowSeasonList.length > 0,
    );
    if (!hasSeasons) return;
    if (this.siSeasonScrollTimer) {
      clearTimeout(this.siSeasonScrollTimer);
      this.siSeasonScrollTimer = null;
    }
    if (this.siAnchorScrollTimer) {
      clearTimeout(this.siAnchorScrollTimer);
      this.siAnchorScrollTimer = null;
    }
    if (this.siAnchorScrollTimer2) {
      clearTimeout(this.siAnchorScrollTimer2);
      this.siAnchorScrollTimer2 = null;
    }
    const anchorY = this.getSeasonAnchorY();
    const curY = this.getScrollY();
    if (!force && !this._needsSeasonAnchorAlign) return;
    const applyScroll = () => {
      if (this.currentView !== "showinfo") return;
      const epSec = this.$g("si-episodes-section");
      if (!epSec || epSec.style.display === "none") return;
      const y = this.getSeasonAnchorY();
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
      if (document.scrollingElement) document.scrollingElement.scrollTop = y;
    };
    applyScroll();
    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(applyScroll);
    });
    this.siAnchorScrollTimer = setTimeout(applyScroll, 45);
    this.siAnchorScrollTimer2 = setTimeout(() => {
      applyScroll();
    }, 130);
  },
  showSeasonSelector: function (fromHistory = false) {
    this.showSiScrollOverlay(false);
    this.scrollDownOnReturnToShowinfo = false;
    this.scrollOverlayOnReturnToShowinfo = false;
    this.updateShowinfoPlayBtn();
    this.updateSeasonCardsHighlight();
    this.pendingSeasonAnchorScroll = false;
    this._needsSeasonAnchorAlign = false;
    this.pendingScrollToEpisode = false;
    this.pendingScrollToEpTop = false;
    if (this.siAnchorScrollTimer) {
      clearTimeout(this.siAnchorScrollTimer);
      this.siAnchorScrollTimer = null;
    }
    if (this.siAnchorScrollTimer2) {
      clearTimeout(this.siAnchorScrollTimer2);
      this.siAnchorScrollTimer2 = null;
    }
    if (this.siSeasonScrollTimer) {
      clearTimeout(this.siSeasonScrollTimer);
      this.siSeasonScrollTimer = null;
    }
    const epSec = this.$g("si-episodes-section");
    const seasonsSec = this.$g("si-seasons-section");
    if (epSec && seasonsSec) {
      this.animateHeight(seasonsSec, () => {
        epSec.style.display = "none";
        seasonsSec.style.display = "block";
      });
    } else {
      if (epSec) epSec.style.display = "none";
      if (seasonsSec) seasonsSec.style.display = "block";
    }
    const epGrid = this.$g("si-ep-grid");
    if (epGrid)
      epGrid.innerHTML =
        '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    const epPag = this.$g("si-ep-pagination");
    if (epPag) epPag.innerHTML = "";
    const seasonsHdr = this.$g("si-seasons-header");
    if (seasonsHdr) seasonsHdr.style.display = "";
    const lLoader = this.$g("si-lower-loader");
    if (lLoader) lLoader.style.display = "none";
    const castRow = this.$g("si-cast-row");
    const castSec = this.$g("si-cast-section");
    if (castSec && castRow && castRow.children.length > 0) {
      castSec.style.display = "block";
      castRow.scrollLeft = 0;
      if (typeof this.checkScrollArrow === "function")
        this.checkScrollArrow(castRow);
    }
    const simRow = this.$g("si-similar-row");
    const simSec = this.$g("si-similar-section");
    if (simSec && simRow && simRow.children.length > 0) {
      simSec.style.display = "block";
      simRow.scrollLeft = 0;
      if (typeof this.checkScrollArrow === "function")
        this.checkScrollArrow(simRow);
    }
    this.applySeasonViewMode();
    const defaultAnchorY =
      this.currentShow &&
      (this.currentShow.media_type === "tv" ||
        this.currentShow.type === "tv") &&
      this.currentShowSeasonList?.length > 0
        ? this.getSeasonAnchorY()
        : 0;
    const targetY =
      this.siSeasonScrollY !== undefined &&
      this.siSeasonScrollY !== null &&
      this.siSeasonScrollY > 0
        ? this.siSeasonScrollY
        : (this.showSeasonScrollY &&
            this.currentShow &&
            this.showSeasonScrollY[this.currentShow.id]) ||
          defaultAnchorY;
    if (targetY > 0) {
      this.restoreScroll(targetY);
      this.siSeasonScrollTimer = setTimeout(() => {
        this.restoreScroll(targetY);
        this.siSeasonScrollTimer = null;
      }, 60);
    } else {
      window.scrollTo(0, 0);
    }
    if (
      !fromHistory &&
      window.history.state &&
      window.history.state.sub === "episodes"
    ) {
      window.history.replaceState(
        {
          view: "showinfo",
          id: this.currentShow
            ? this.currentShow.id
            : window.history.state.id || null,
          type: this.currentShow
            ? this.currentShow.media_type || "tv"
            : window.history.state.type || "tv",
        },
        document.title,
        window.location.href,
      );
    }
  },
  toggleSeasonViewMode: function () {
    this.seasonViewMode = this.seasonViewMode === "list" ? "grid" : "list";
    this.$storeSet("seasonViewMode", this.seasonViewMode);
    this.antiSpoiler = this.seasonViewMode === "list";
    this.$storeSet("antiSpoiler", this.antiSpoiler);
    this.applySeasonViewMode(true);
  },
  applySeasonViewMode: function (animate = false) {
    if (!this.seasonViewMode) {
      this.seasonViewMode = this.$storeGet("seasonViewMode", null);
      if (!this.seasonViewMode) {
        this.seasonViewMode = this.$storeGet("antiSpoiler", false)
          ? "list"
          : "grid";
      }
    }
    const isList = this.seasonViewMode === "list";
    this.antiSpoiler = isList;
    const epSec = this.$g("si-episodes-section");
    const sSec = this.$g("si-seasons-section");
    const isShowinfo = this.currentView === "showinfo";
    const btn = this.$g("si-seasons-view-toggle");
    if (btn) {
      btn.innerHTML = isList ? GRID_VIEW_SVG : LIST_VIEW_SVG;
      btn.title = isList ? "Switch to Grid View" : "Switch to List View";
    }
    const epBtn = this.$g("anti-spoiler-btn");
    if (epBtn) {
      epBtn.innerHTML = isList ? GRID_VIEW_SVG : LIST_VIEW_SVG;
      epBtn.title = isList ? "Switch to Grid View" : "Switch to List View";
    }
    const grid = this.$g("si-seasons-grid");
    const epGrid = this.$g("si-ep-grid");
    var sSecVisible = isShowinfo && sSec && sSec.style.display !== "none";
    var epSecVisible = isShowinfo && epSec && epSec.style.display !== "none";
    if (animate && sSecVisible && grid) {
      grid.classList.add("view-switching");
      setTimeout(() => {
        const applyFn = () => {
          document.body.classList.toggle("anti-spoiler-active", isList);
          grid.classList.toggle("list-view", isList);
        };
        const revertFn = () => {
          document.body.classList.toggle("anti-spoiler-active", !isList);
          grid.classList.toggle("list-view", !isList);
        };
        this.animateHeight(sSec, applyFn, revertFn);
        grid.classList.remove("view-switching");
      }, 110);
    } else if (animate && epSecVisible && epGrid) {
      epGrid.classList.add("view-switching");
      setTimeout(() => {
        const applyFn = () => {
          document.body.classList.toggle("anti-spoiler-active", isList);
          if (grid) grid.classList.toggle("list-view", isList);
        };
        const revertFn = () => {
          document.body.classList.toggle("anti-spoiler-active", !isList);
          if (grid) grid.classList.toggle("list-view", !isList);
        };
        this.animateHeight(epSec, applyFn, revertFn);
        epGrid.classList.remove("view-switching");
      }, 110);
    } else {
      document.body.classList.toggle("anti-spoiler-active", isList);
      if (grid) grid.classList.toggle("list-view", isList);
    }
    const histBtn = this.$g("history-ep-view-toggle");
    if (histBtn) {
      let histMode = this.epHistoryViewMode || "grid";
      if (histMode === "min") {
        histBtn.innerHTML = GRID_VIEW_SVG;
        histBtn.title = "Switch to Grid View";
      } else if (histMode === "list") {
        histBtn.innerHTML = MIN_VIEW_SVG;
        histBtn.title = "Minimize All";
      } else {
        histBtn.innerHTML = LIST_VIEW_SVG;
        histBtn.title = "Switch to List View";
      }
    }
    const histContainer = this.$g("history-episodes-list");
    if (histContainer) {
      histContainer.classList.toggle(
        "list-view",
        this.epHistoryViewMode === "list" || this.epHistoryViewMode === "min",
      );
    }
    if (this.currentView === "history" && this.historySub === "episodes") {
      this.updateArrows();
    }
  },
  setEpHeading: function (text) {
    const heading = this.$g("si-ep-heading");
    if (!heading) return;
    const t = text || "Episodes";
    heading.textContent = t;
    const len = t.length;
    heading.classList.toggle("is-long", len > 22 && len <= 42);
    heading.classList.toggle("is-extra-long", len > 42);
  },
  async fetchSeasonEpisodes(id, season) {
    const parsedS = parseInt(season, 10);
    const sNum = isNaN(parsedS) ? 1 : parsedS;
    const epKey = `${id}_s${sNum}`;
    const c = this.lruGet(this.episodeCache, epKey);
    if (c) return c;
    if (
      String(id).startsWith("ani_") ||
      (this.currentShow &&
        this.currentShow.is_anilist &&
        String(this.currentShow.id) === String(id))
    ) {
      const epCount =
        (this.currentShow &&
          String(this.currentShow.id) === String(id) &&
          ((this.currentShow.seasons &&
            this.currentShow.seasons[0]?.episode_count) ||
            this.currentShow.number_of_episodes)) ||
        this.animeCache?.[id]?.episodes ||
        this.animeCache?.[String(id).replace("ani_", "")]?.episodes ||
        1;
      const eps = [];
      for (let e = 1; e <= epCount; e++) {
        eps.push({
          episode_number: e,
          name: `Episode ${e}`,
          overview: "",
          still_path:
            this.currentShow?.backdrop_path ||
            this.currentShow?.poster_path ||
            null,
          air_date: "",
        });
      }
      const res = { season_number: sNum, episodes: eps };
      this.lruSet(this.episodeCache, epKey, res, "episode");
      return res;
    }
    return this._runInFlight("episodeInFlight", epKey, async () => {
      let data = null;
      try {
        const sRes = await fetch(
          `${BASE_URL}/tv/${id}/season/${sNum}?api_key=${TMDB_KEY_MEDIA}`,
        );
        if (sRes.ok) data = await sRes.json();
      } catch (e) {}
      if (!data || !data.episodes) {
        data = await this.api(`/tv/${id}/season/${sNum}`);
      }
      if (data && data.episodes && data.episodes.length > 0) {
        const cleanSeason = this.sanitizeEpisodeSeason(data);
        this.lruSet(this.episodeCache, epKey, cleanSeason, "episode");
        return cleanSeason;
      }
      return data || { episodes: [] };
    });
  },
  async loadEpisodes(seasonNum, page = null) {
    if (!this.currentShow) return;
    this.updateShowinfoPlayBtn();
    const sNum = parseInt(seasonNum, 10) || 1;
    this.showSeasons[this.currentShow.id] = sNum;
    this.$storeSet("showSeasons", this.showSeasons);
    if (!this._episodesReqId) this._episodesReqId = 0;
    const reqId = ++this._episodesReqId;
    if (this.currentShow.is_anilist) {
      const epCount =
        (this.currentShow.seasons &&
          this.currentShow.seasons[0]?.episode_count) ||
        12;
      const epList = [];
      for (let e = 1; e <= epCount; e++) {
        epList.push({
          episode_number: e,
          name: `Episode ${e}`,
          overview: "",
          still_path:
            this.currentShow.backdrop_path || this.currentShow.poster_path,
          air_date: "",
        });
      }
      this.currentEpisodes = epList;
      this.currentOmdbEpisodes = {};
      const pageKey = `${this.currentShow.id}_${sNum}`;
      const targetPage = page || this.showEpPages[pageKey] || 1;
      this.renderEpisodePage(sNum, targetPage);
      void document.documentElement.offsetHeight;
      if (this.pendingScrollToEpTop) {
        this.pendingScrollToEpTop = false;
        requestAnimationFrame(() => {
          const epSec = this.$g("si-episodes-section");
          if (epSec)
            epSec.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else if (
        this.pendingSeasonAnchorScroll &&
        this.currentShowSeasonList &&
        this.currentShowSeasonList.length > 1
      ) {
        this.pendingSeasonAnchorScroll = false;
        this._needsSeasonAnchorAlign = false;
        this.alignToSeasonAnchor(true);
      } else {
        this.pendingSeasonAnchorScroll = false;
        this._needsSeasonAnchorAlign = false;
      }
      return;
    }
    const grid = this.$g("si-ep-grid");
    const pag = this.$g("si-ep-pagination");
    if (grid)
      grid.innerHTML =
        '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    if (pag) pag.innerHTML = "";
    const imdbId = this.currentShow?.external_ids?.imdb_id;
    const isAnimeShow = Boolean(
      this.currentShow.isAnime || this.isAnimeItem(this.currentShow),
    );
    const validSList = (this.currentShow.seasons || []).filter((s) =>
      this.isSeasonAired(s),
    );
    const sCfg = (this.currentShowSeasonList || []).find(
      (s) => (s.season_number || s.season || s) == sNum,
    );
    const apiSNum =
      sCfg && sCfg._tmdbSeason !== undefined
        ? sCfg._tmdbSeason
        : isAnimeShow && validSList.length <= 1
          ? validSList[0]?.season_number || 1
          : sNum;
    const data = await this.fetchSeasonEpisodes(this.currentShow.id, apiSNum);
    const omdbMap =
      imdbId && apiSNum > 0
        ? await this.getOmdbSeasonRatings(imdbId, apiSNum)
        : {};
    if (reqId !== this._episodesReqId) return;
    if (
      (!data || !data.episodes || data.episodes.length === 0) &&
      !sCfg?._isSpecialGroup
    ) {
      grid.innerHTML = "No episodes found.";
      if (pag) pag.innerHTML = "";
      return;
    }
    this.currentEpisodes = data && data.episodes ? data.episodes : [];
    this.currentOmdbEpisodes = omdbMap || {};
    const specMatched = sCfg?._isSpecialGroup
      ? this.resolveSpecialGroupEps(
          this.currentEpisodes,
          sCfg._specialEntries,
          sCfg.season_number,
        )
      : null;
    const firstEp =
      specMatched && specMatched.length > 0
        ? specMatched[0]
        : sCfg?._epStart
          ? this.currentEpisodes.find((e) => e.episode_number === sCfg._epStart)
          : validSList.length <= 1 &&
              sNum > 1 &&
              this.currentAnimeInfo?.sequelChain?.length > 1
            ? this.currentEpisodes.find(
                (e) =>
                  this.resolveAnimeSequelEp(
                    e.episode_number,
                    this.currentAnimeInfo.sequelChain,
                  ).season === sNum,
              )
            : this.currentEpisodes[0];
    if (isAnimeShow && firstEp?.air_date) {
      const ep1Parts = firstEp.air_date.split("-");
      const ep1Yr = parseInt(ep1Parts[0], 10);
      const ep1Mo = parseInt(ep1Parts[1], 10);
      let ep1Season = "";
      if (ep1Mo >= 1 && ep1Mo <= 3) ep1Season = "Winter";
      else if (ep1Mo >= 4 && ep1Mo <= 6) ep1Season = "Spring";
      else if (ep1Mo >= 7 && ep1Mo <= 9) ep1Season = "Summer";
      else if (ep1Mo >= 10 && ep1Mo <= 12) ep1Season = "Fall";
      if (ep1Season && ep1Yr) {
        const yrEl = document.querySelector(
          `.si-season-card[data-season-num="${sNum}"] .si-season-year`,
        );
        if (yrEl) {
          yrEl.innerText = `${ep1Season} ${ep1Yr}`;
        }
        if (!this.animeCache) this.animeCache = {};
        const sKey = `${this.currentShow.id}_s${sNum}`;
        if (!this.animeCache[sKey]) this.animeCache[sKey] = {};
        this.animeCache[sKey].season = ep1Season.toUpperCase();
        this.animeCache[sKey].seasonYear = ep1Yr;
        this.animeCache[sKey].airDate = firstEp.air_date;
        this.animeCache[sKey].fromEpisode = true;
        if (sNum === 1) {
          if (!this.animeCache[String(this.currentShow.id)])
            this.animeCache[String(this.currentShow.id)] = {};
          this.animeCache[String(this.currentShow.id)].season =
            ep1Season.toUpperCase();
          this.animeCache[String(this.currentShow.id)].seasonYear = ep1Yr;
          this.animeCache[String(this.currentShow.id)].airDate =
            firstEp.air_date;
          this.animeCache[String(this.currentShow.id)].fromEpisode = true;
        }
        this.persistCache("anime");
      }
    }
    const pageKey = `${this.currentShow.id}_${sNum}`;
    const targetPage =
      page ||
      (this.pendingScrollToEpisode ? null : this.showEpPages[pageKey] || 1);
    this.renderEpisodePage(sNum, targetPage);
    void document.documentElement.offsetHeight;
    if (this.pendingScrollToEpisode) {
      this.pendingScrollToEpisode = false;
      this.pendingSeasonAnchorScroll = false;
      requestAnimationFrame(() => {
        setTimeout(() => {
          const targetEl =
            document.querySelector("#si-ep-grid .ep-card.highlighted-ep") ||
            document.querySelector("#si-ep-grid .ep-card.resume-ep") ||
            this.$g("si-episodes-section");
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            if (targetEl.classList.contains("highlighted-ep")) {
              setTimeout(() => {
                targetEl.classList.remove("highlighted-ep");
              }, 2000);
            }
          }
          this.pendingHighlightEpisode = null;
          setTimeout(() => {
            this.showSiScrollOverlay(false);
          }, 120);
        }, 60);
      });
    } else if (
      this.pendingSeasonAnchorScroll &&
      this.currentShowSeasonList &&
      this.currentShowSeasonList.length > 1
    ) {
      this.pendingSeasonAnchorScroll = false;
      this._needsSeasonAnchorAlign = false;
      this.alignToSeasonAnchor(true);
      this.showSiScrollOverlay(false);
    } else if (this.pendingScrollToEpTop) {
      this.pendingScrollToEpTop = false;
      requestAnimationFrame(() => {
        const epSec = this.$g("si-episodes-section");
        if (epSec) epSec.scrollIntoView({ behavior: "smooth", block: "start" });
        this.showSiScrollOverlay(false);
      });
    } else {
      this.pendingSeasonAnchorScroll = false;
      this._needsSeasonAnchorAlign = false;
      this.showSiScrollOverlay(false);
    }
    if (isAnimeShow && !this.currentShow.is_anilist) {
      if (sCfg?._aniEntry) {
        if (!this.animeCache) this.animeCache = {};
        const existingS =
          this.animeCache[`${this.currentShow.id}_s${sNum}`] || {};
        this.animeCache[`${this.currentShow.id}_s${sNum}`] = {
          ...existingS,
          ...sCfg._aniEntry,
          aniId: sCfg._aniEntry.id,
          malId: sCfg._aniEntry.idMal || sCfg._aniEntry.id,
          _showId: String(this.currentShow.id),
        };
      }
      const cachedInfo =
        this.animeCache &&
        (this.animeCache[`${this.currentShow.id}_s1`] ||
          this.animeCache[`${this.currentShow.id}_s${sNum}`]);
      if (
        !cachedInfo ||
        !this.currentAnimeInfo ||
        (this.currentAnimeInfo._showId &&
          String(this.currentAnimeInfo._showId) !== String(this.currentShow.id))
      ) {
        const animeFetchSeason =
          sCfg && sCfg._tmdbSeason !== undefined && sCfg._tmdbSeason > 0
            ? sCfg._tmdbSeason
            : sCfg && sCfg._tmdbSeason === 0
              ? 1
              : sNum;
        this.fetchAnimeInfo(this.currentShow, animeFetchSeason).then((info) => {
          if (info) {
            info._showId = String(this.currentShow?.id);
            if (
              this.currentShow &&
              String(this.currentShow.id) === String(info._showId)
            ) {
              this.currentAnimeInfo = info;
              const curValidSeasons = (this.currentShow.seasons || []).filter(
                (s) => this.isSeasonAired(s),
              );
              if (
                curValidSeasons.length <= 1 &&
                info.sequelChain &&
                info.sequelChain.length > 1
              ) {
                const totalS = Math.max(
                  ...info.sequelChain.map((s) => s.season || 1),
                );
                const sValEl = this.$g("si-seasons-val");
                if (sValEl) sValEl.innerText = totalS;
                this.renderEpisodePage(sNum, this.showEpPages[pageKey] || 1);
              }
            }
          }
        });
      }
    }
  },
  renderEpisodePage: function (seasonNum, page, scrollUp = false) {
    if (!this.currentEpisodes) return;
    this.updateShowinfoPlayBtn();
    const sNum = parseInt(seasonNum, 10) || 1;
    const sKey = `${this.currentShow?.id}_${sNum}`;
    const curRememberedPage = (this.showEpPages && this.showEpPages[sKey]) || 1;
    if (scrollUp && page && parseInt(page, 10) === curRememberedPage) {
      return;
    }
    const curShowId = String(this.currentShow?.id || "");
    const animeInfo = this.getShowAnimeInfo(curShowId, sNum);
    const validSeasons = (this.currentShow.seasons || []).filter((s) =>
      this.isSeasonAired(s),
    );
    const isAnimeShow = Boolean(
      this.currentShow?.isAnime || this.isAnimeItem(this.currentShow),
    );
    const isCombinedAnime =
      isAnimeShow &&
      validSeasons.length <= 1 &&
      this.currentShowSeasonList &&
      this.currentShowSeasonList.length > 1 &&
      animeInfo?.sequelChain &&
      animeInfo.sequelChain.length > 1;
    if (isCombinedAnime) {
      const sel = this.$g("si-season-select");
      const cSeasons = this.currentShowSeasonList.map(
        (s) => s.season_number || s.season || s,
      );
      if (sel && sel.options.length !== cSeasons.length) {
        sel.innerHTML = cSeasons
          .map((s) => `<option value="${s}">Season ${s}</option>`)
          .join("");
        sel.value = sNum;
      }
      if (sel) sel.style.display = "none";
    }
    const isMultiSeason = validSeasons.length > 1 || isCombinedAnime;
    const hasSeasons = Boolean(
      this.currentShowSeasonList && this.currentShowSeasonList.length > 0,
    );
    const backBtn = this.$g("si-back-to-seasons");
    if (backBtn) backBtn.style.display = hasSeasons ? "inline-flex" : "none";
    if (isMultiSeason) {
      const sObj = (this.currentShowSeasonList || []).find(
        (s) => (s.season_number || s.season || s) == sNum,
      );
      this.setEpHeading(
        sObj ? sObj.name || `Season ${sNum}` : `Season ${sNum}`,
      );
    } else {
      this.setEpHeading("Episodes");
    }
    this.updateSeasonCardsHighlight();
    const sCfg = (this.currentShowSeasonList || []).find(
      (s) => (s.season_number || s.season || s) == sNum,
    );
    const isSpecialGroup = Boolean(sCfg && sCfg._isSpecialGroup);
    const isHybridSplit = Boolean(
      sCfg &&
      sCfg._tmdbSeason !== undefined &&
      (sCfg._epStart > 1 || sCfg._isHybridSplit),
    );
    const eps = isSpecialGroup
      ? this.resolveSpecialGroupEps(
          this.currentEpisodes,
          sCfg._specialEntries,
          sCfg.season_number,
        )
      : isHybridSplit
        ? this.currentEpisodes.filter(
            (ep) =>
              ep.episode_number >= (sCfg._epStart || 1) &&
              ep.episode_number <= (sCfg._epEnd || 99999),
          )
        : isCombinedAnime
          ? this.currentEpisodes.filter(
              (ep) =>
                this.resolveAnimeSequelEp(
                  ep.episode_number,
                  animeInfo.sequelChain,
                ).season === sNum,
            )
          : this.currentEpisodes;
    const totalPages = Math.ceil(eps.length / 50);
    let curPage = parseInt(page, 10);
    if (!curPage) {
      const hi = this.pendingHighlightEpisode;
      if (
        hi &&
        String(hi.showId) === String(this.currentShow?.id) &&
        Number(hi.season) === Number(sNum) &&
        hi.episode
      ) {
        const hiIdx = eps.findIndex(
          (e) => Number(e.episode_number) === Number(hi.episode),
        );
        if (hiIdx !== -1) curPage = Math.floor(hiIdx / 50) + 1;
      }
      if (!curPage) {
        const hist = this.getHistory();
        const showInHist = hist.find(
          (x) => String(x.id) === String(this.currentShow?.id),
        );
        if (
          showInHist &&
          (showInHist.last_season === sNum ||
            showInHist.last_hybrid_season === sNum ||
            (sCfg &&
              sCfg._tmdbSeason !== undefined &&
              showInHist.last_season === sCfg._tmdbSeason)) &&
          showInHist.last_episode
        ) {
          const epIdx = eps.findIndex(
            (e) => e.episode_number === showInHist.last_episode,
          );
          if (epIdx !== -1) curPage = Math.floor(epIdx / 50) + 1;
        }
      }
      if (!curPage) curPage = 1;
    }
    if (curPage < 1) curPage = 1;
    if (curPage > totalPages && totalPages > 0) curPage = totalPages;
    const pageKey = `${this.currentShow.id}_${sNum}`;
    this.showEpPages[pageKey] = curPage;
    this.$storeSet("showEpPages", this.showEpPages);
    const start = (curPage - 1) * 50;
    const pageEps = eps.slice(start, start + 50);
    const fallbackImg = this.currentShow.poster_path
      ? this.getImg(this.currentShow.poster_path, "poster")
      : "";
    const grid = this.$g("si-ep-grid");
    const hist = this.getHistory();
    const showInHist = hist.find(
      (x) => String(x.id) === String(this.currentShow?.id),
    );
    grid.innerHTML = pageEps
      .map((ep) => {
        const img = ep.still_path
          ? this.getImg(ep.still_path, "still")
          : fallbackImg;
        let date = "";
        if (ep.air_date) {
          const dObj = new Date(ep.air_date);
          if (!isNaN(dObj.getTime())) {
            const day = dObj.getUTCDate();
            const month = dObj.toLocaleString("en-US", {
              month: "short",
              timeZone: "UTC",
            });
            const year = dObj.getUTCFullYear();
            date = `${day} ${month} ${year}`;
          }
        }
        const epOmdbRating =
          this.currentOmdbEpisodes &&
          this.currentOmdbEpisodes[String(ep.episode_number)];
        const epRatingVal =
          epOmdbRating ||
          (ep.vote_average > 0 ? ep.vote_average.toFixed(1) : null);
        const isEpLowVote10 =
          (epRatingVal === "10.0" || epRatingVal === "10") &&
          (ep.vote_count === undefined ||
            ep.vote_count === null ||
            ep.vote_count < 50);
        const epHintBtnHtml = isEpLowVote10
          ? ` <button type="button" class="rating-hint-btn" onclick="event.stopPropagation();app.toggleVoteFluctuate(this,'ep-hint-${sNum}-${ep.episode_number}')">?</button>`
          : "";
        const baseMeta = [ep.runtime ? `${ep.runtime}m` : "", date].filter(
          Boolean,
        );
        const ratingHtml = epRatingVal
          ? `<span class="ep-rating-sep">${baseMeta.length > 0 ? " &bull; " : ""}</span><span class="ep-rating" style="display:inline-flex;align-items:center;gap:3px;color:#f5c518;">${STAR_SVG(11, 11)}${epRatingVal}${epHintBtnHtml}</span>`
          : "";
        const epFluctuateHtml = isEpLowVote10
          ? `<div id="ep-hint-${sNum}-${ep.episode_number}" class="ep-vote-fluctuate-msg">Based on very few user votes, score may fluctuate</div>`
          : "";
        const metaHtml =
          baseMeta.length > 0 || epRatingVal
            ? `<div class="ep-meta">${baseMeta.join(" &bull; ")}${ratingHtml}</div>${epFluctuateHtml}`
            : "";
        let epSeason =
          sCfg && sCfg._tmdbSeason !== undefined ? sCfg._tmdbSeason : sNum;
        let epNumber = isSpecialGroup ? ep._relEp || 1 : ep.episode_number;
        if (isCombinedAnime) {
          const res = this.resolveAnimeSequelEp(
            ep.episode_number,
            animeInfo.sequelChain,
          );
          epSeason = res.season;
          epNumber = res.ep;
        }
        const watchSeason =
          sCfg && sCfg._tmdbSeason !== undefined
            ? sCfg._tmdbSeason
            : isCombinedAnime
              ? validSeasons[0]?.season_number || 1
              : sNum;
        const epPrefix =
          isSpecialGroup || epSeason === 0
            ? `E${epNumber}`
            : `S${epSeason} E${epNumber}`;
        const isSpecialOrOva = Boolean(
          isSpecialGroup ||
          epSeason === 0 ||
          (sCfg &&
            (sCfg._isSpecialGroup ||
              sCfg._isSpecial ||
              sCfg.format === "SPECIAL" ||
              sCfg.format === "OVA")) ||
          (isAnimeShow &&
            (this.currentShow?.format === "OVA" ||
              this.currentShow?.format === "SPECIAL" ||
              this.currentShow?.type === "OVA" ||
              this.currentShow?.type === "Special" ||
              animeInfo?.animeFormat === "OVA" ||
              animeInfo?.animeFormat === "SPECIAL")),
        );
        const titleText = isSpecialOrOva
          ? ep.name || `Episode ${epNumber}`
          : `${epPrefix} - ${ep.name}`;
        const hi = this.pendingHighlightEpisode;
        const isHighlightedEp = Boolean(
          hi &&
          String(hi.showId) === String(this.currentShow?.id) &&
          Number(hi.season) === Number(sNum) &&
          Number(hi.episode) === Number(ep.episode_number),
        );
        const isLastPlayed = Boolean(
          showInHist &&
          Number(showInHist.last_season) === Number(watchSeason) &&
          Number(showInHist.last_episode) === Number(ep.episode_number) &&
          (showInHist.last_hybrid_season === undefined ||
            showInHist.last_hybrid_season === null ||
            Number(showInHist.last_hybrid_season) === Number(sNum)),
        );
        const epCls =
          "ep-card" +
          (isLastPlayed ? " resume-ep" : "") +
          (isHighlightedEp ? " highlighted-ep" : "");
        const castBtnHtml =
          '<button type="button" class="ep-cast-btn" title="Episode Cast" aria-label="Episode Cast" onclick="event.stopPropagation();app.openEpisodeCastModal(\'' +
          this.currentShow.id +
          "'," +
          watchSeason +
          "," +
          ep.episode_number +
          ',this)">' +
          PICTURE_SVG +
          "</button>";
        return (
          '<div class="' +
          epCls +
          '" onclick="app.openWatch(\'' +
          this.currentShow.id +
          "','tv'," +
          watchSeason +
          "," +
          ep.episode_number +
          ",true,false," +
          sNum +
          ')"><img src="' +
          img +
          '" class="ep-img" loading="lazy"><div class="ep-info"><div class="ep-title-row"><div class="ep-title">' +
          titleText +
          "</div>" +
          castBtnHtml +
          "</div>" +
          metaHtml +
          '<div class="ep-desc">' +
          (ep.overview || "") +
          "</div></div></div>"
        );
      })
      .join("");
    const pag = this.$g("si-ep-pagination");
    const epSec = this.$g("si-episodes-section");
    if (epSec && epSec.style.minHeight) {
      this.animateHeight(epSec, () => {
        epSec.style.minHeight = "";
      });
    }
    if (!pag) {
      this.applySeasonViewMode();
      return;
    }
    if (totalPages <= 1) {
      pag.innerHTML = "";
      pag.style.display = "none";
      this.applySeasonViewMode();
      return;
    }
    pag.style.display = "flex";
    let btns = "";
    const prevDisabled = curPage <= 1 ? " disabled" : "";
    const prevClick =
      curPage <= 1
        ? ""
        : ' onclick="app.renderEpisodePage(' +
          sNum +
          "," +
          (curPage - 1) +
          ',true)"';
    btns +=
      '<button class="ep-page-btn"' +
      prevDisabled +
      prevClick +
      ">&lt;</button>";
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === curPage;
      const activeCls = isActive ? " active" : "";
      const clickAttr = isActive
        ? ""
        : ' onclick="app.renderEpisodePage(' + sNum + "," + p + ',true)"';
      btns +=
        '<button class="ep-page-btn' +
        activeCls +
        '"' +
        clickAttr +
        ">" +
        p +
        "</button>";
    }
    const nextDisabled = curPage >= totalPages ? " disabled" : "";
    const nextClick =
      curPage >= totalPages
        ? ""
        : ' onclick="app.renderEpisodePage(' +
          sNum +
          "," +
          (curPage + 1) +
          ',true)"';
    btns +=
      '<button class="ep-page-btn"' +
      nextDisabled +
      nextClick +
      ">&gt;</button>";
    pag.innerHTML = btns;
    if (scrollUp) {
      const sec = this.$g("si-episodes-section");
      if (sec)
        sec.scrollIntoView({
          behavior: "smooth",
        });
    }
    this.applySeasonViewMode();
  },
  async openWatch(
    id,
    type,
    season,
    episode,
    pushState = true,
    replaceState = false,
    targetHybridSeason = null,
  ) {
    const currentWatchReqId = ++this.watchReqId || (this.watchReqId = 1);
    this.blockWatchOnBack = false;
    if (this.currentView === "history" && this.historySub === "episodes") {
      this.watchFromEpHistory = true;
    } else if (!this.autoNextTriggered && this.currentView !== "watch") {
      this.watchFromEpHistory = false;
    }
    this.startLoader();
    this.setActiveView("watch", null);
    this.checkTooltip();
    window.scrollTo(0, 0);
    this.currentView = "watch";
    this.updateBackBtn("watch");
    const wtEl = this.$g("w-title");
    if (wtEl) {
      wtEl.innerText = "";
      wtEl.classList.remove("is-long", "is-extra-long");
    }
    if (Date.now() - (this.lastAutoNextTime || 0) > 4000) {
      this.autoNextTriggered = false;
    }
    this.watchState.id = id;
    this.watchState.type = type;
    this.watchState.season = parseInt(season);
    this.watchState.episode = parseInt(episode);
    this.watchState.targetSeason = null;
    this.watchState.dispSeason = null;
    this.watchState.dispEp = null;
    if (targetHybridSeason) {
      this.showSeasons[id] = parseInt(targetHybridSeason, 10);
      this.$storeSet("showSeasons", this.showSeasons);
    } else if (type === "tv" && season) {
      this.showSeasons[id] = parseInt(season, 10);
      this.$storeSet("showSeasons", this.showSeasons);
    }
    if (typeof id === "string" && id.startsWith("tt")) {
      this.watchState.imdbId = id;
    } else if (
      this.currentShow &&
      (this.currentShow.imdb_id || this.currentShow.external_ids?.imdb_id)
    ) {
      this.watchState.imdbId =
        this.currentShow.imdb_id || this.currentShow.external_ids?.imdb_id;
    } else {
      this.watchState.imdbId = null;
    }
    if (!this.currentShow || String(this.currentShow.id) !== String(id)) {
      if (typeof id === "string" && id.startsWith("ani_")) {
        this.watchState.aniId = parseInt(id.replace("ani_", ""), 10);
        this.watchState.isAnime = true;
      } else if (typeof id !== "string" || !id.startsWith("tt")) {
        const cachedShow = this.getShowDetailsCache
          ? this.getShowDetailsCache(`${type}_${id}`) ||
            this.getShowDetailsCache(id)
          : null;
        let data = cachedShow?.data || null;
        if (!data) {
          data = await this.api(`/${type}/${id}`, {
            append_to_response: "external_ids,alternative_titles",
          });
        }
        this.currentShow = data;
        this.currentShow.media_type = type;
        this.currentShow.country = this.getCountryCode(data);
        if (data && data.external_ids && data.external_ids.imdb_id)
          this.watchState.imdbId = data.external_ids.imdb_id;
      }
    }
    const isAnime = Boolean(
      (typeof id === "string" && id.startsWith("ani_")) ||
      this.isAnimeItem(this.currentShow),
    );
    this.currentShow.isAnime = isAnime;
    this.watchState.isAnime = isAnime;
    if (isAnime) {
      const curVariant =
        this.$storeGet("preferredAnimeVariant", "sub") || "sub";
      const curPrefPlayer =
        this.$storeGet(
          curVariant === "dub"
            ? "preferredAnimeDubPlayer"
            : "preferredAnimePlayer",
          "1",
        ) || "1";
      if (
        this.currentShow?.is_anilist ||
        (typeof id === "string" && id.startsWith("ani_"))
      ) {
        this.watchState.aniId =
          this.currentShow?.ani_id ||
          parseInt(String(id).replace("ani_", ""), 10);
        this.watchState.malId =
          this.currentShow?.mal_id || this.watchState.aniId;
        this.watchState.animeFormat = type === "movie" ? "MOVIE" : "TV";
        this.watchState.animeEp = type === "tv" ? parseInt(episode) : 1;
        this.updatePlayerDropdown(curVariant, curPrefPlayer);
      } else {
        const parsedS = parseInt(season, 10);
        const sNum = type === "tv" ? (isNaN(parsedS) ? 1 : parsedS) : 1;
        const info = await this.fetchAnimeInfo(this.currentShow, sNum);
        if (info) {
          let targetAniId = info.aniId;
          let targetMalId = info.malId;
          let targetFormat = info.animeFormat;
          const parsedEp = parseInt(episode, 10);
          let targetEp = isNaN(parsedEp) ? 1 : parsedEp;
          let targetSeason = sNum;
          const validWatchSeasons = (this.currentShow?.seasons || []).filter(
            (s) => this.isSeasonAired(s),
          );
          const isCombinedWatch = Boolean(
            validWatchSeasons.length <= 1 &&
            info.sequelChain &&
            info.sequelChain.length > 1,
          );
          if (type === "tv" && isCombinedWatch) {
            const res = this.resolveAnimeSequelEp(episode, info.sequelChain);
            if (res.entry) {
              targetAniId = res.entry.id;
              targetMalId = res.entry.idMal || res.entry.id;
              targetFormat = res.entry.format || targetFormat;
              targetEp = res.rem;
              targetSeason = res.season;
              this.watchState.dispSeason = res.season;
              this.watchState.dispEp = res.ep;
            }
          }
          this.watchState.targetSeason = targetSeason;
          this.watchState.aniId = targetAniId;
          this.watchState.malId = targetMalId;
          this.watchState.animeFormat = targetFormat;
          this.watchState.animeEp = targetEp;
        } else {
          Object.assign(this.watchState, {
            aniId: null,
            malId: null,
            animeFormat: null,
            animeEp: null,
          });
        }
        if (type === "movie") this.watchState.animeFormat = "MOVIE";
        this.updatePlayerDropdown(curVariant, curPrefPlayer);
      }
    } else {
      Object.assign(this.watchState, {
        aniId: null,
        malId: null,
        animeFormat: null,
        animeEp: null,
      });
      const pNum = this.$storeGet("preferredPlayer", "1") || "1";
      const typeSel = this.$g("w-player-type-sel");
      if (typeSel) typeSel.style.display = "none";
      this.updatePlayerDropdown("embed", pNum);
    }
    this.saveHistory(
      this.toCardSummary(this.currentShow, type),
      type === "tv" ? parseInt(season) : null,
      type === "tv" ? parseInt(episode) : null,
      null,
      false,
      targetHybridSeason ? parseInt(targetHybridSeason, 10) : null,
    );
    const title = this.currentShow.title || this.currentShow.name;
    let headerText = title;
    let pageTitle = title;
    if (type === "tv") {
      const sData = await this.fetchSeasonEpisodes(id, season);
      const epNums = (sData.episodes || []).map((e) => e.episode_number);
      this.watchState.seasonEpList = epNums;
      this.watchState.epCount =
        epNums.length > 0 ? epNums[epNums.length - 1] : 0;
      const isSynthesizedEp = this.watchState.episode >= 9000;
      if (
        epNums.length > 0 &&
        !epNums.includes(this.watchState.episode) &&
        !isSynthesizedEp
      ) {
        this.watchState.episode = epNums[0];
        episode = epNums[0];
      }
      if (
        this.watchState.isAnime &&
        !this.currentShow?.is_anilist &&
        !String(id).startsWith("ani_")
      ) {
        const sInfo =
          this.animeCache &&
          (this.animeCache[`${this.currentShow.id}_s${season}`] ||
            this.animeCache[String(this.currentShow.id)]);
        const validWatchSeasons = (this.currentShow?.seasons || []).filter(
          (s) => this.isSeasonAired(s),
        );
        const isCombinedWatch = Boolean(
          validWatchSeasons.length <= 1 &&
          sInfo?.sequelChain &&
          sInfo.sequelChain.length > 1,
        );
        if (!isCombinedWatch) {
          const hasPrologue =
            sData.episodes &&
            sData.episodes.length > 0 &&
            (sData.episodes[0].episode_number === 0 ||
              /^(?:episode\s*0|ep\.?\s*0|prologue)\b/i.test(
                sData.episodes[0].name || "",
              ));
          const isFirstEpPrologue =
            hasPrologue &&
            this.watchState.episode === sData.episodes[0].episode_number;
          if (isFirstEpPrologue) {
            const specNode = (sInfo?.relations?.edges || []).find(
              (e) =>
                (e.relationType === "PREQUEL" ||
                  e.relationType === "SIDE_STORY" ||
                  e.relationType === "SPECIAL") &&
                (e.node?.format === "SPECIAL" || e.node?.format === "OVA") &&
                e.node?.episodes === 1,
            )?.node;
            if (specNode) {
              this.watchState.aniId = specNode.id;
              this.watchState.malId = specNode.idMal || specNode.id;
              this.watchState.animeFormat = specNode.format || "SPECIAL";
              this.watchState.animeEp = 1;
            } else {
              this.watchState.animeEp = 1;
            }
          } else {
            let baseRel =
              epNums.length > 0 && epNums[0] > 1
                ? this.watchState.episode - epNums[0] + 1
                : this.watchState.episode;
            if (
              hasPrologue &&
              epNums.length > 1 &&
              this.watchState.episode > sData.episodes[0].episode_number
            ) {
              baseRel = Math.max(1, baseRel - 1);
            }
            let finalEp = baseRel + (sInfo?.epOffset || 0);
            if (
              sInfo?.sequelChain &&
              sInfo.sequelChain.length > 1 &&
              (sInfo.epOffset || 0) === 0
            ) {
              let accum = 0;
              for (const cour of sInfo.sequelChain) {
                const cLimit = cour.episodes || 0;
                if (cLimit && baseRel - accum > cLimit) {
                  accum += cLimit;
                } else {
                  this.watchState.aniId = cour.id;
                  this.watchState.malId = cour.idMal || cour.id;
                  this.watchState.animeFormat =
                    cour.format || this.watchState.animeFormat;
                  finalEp = baseRel - accum;
                  break;
                }
              }
            }
            this.watchState.animeEp = finalEp;
          }
        }
      }
      const epObj = sData.episodes
        ? sData.episodes.find(
            (e) => e.episode_number === this.watchState.episode,
          )
        : null;
      const rawEpName =
        epObj &&
        epObj.name &&
        epObj.name.trim() &&
        epObj.name.trim().toLowerCase() !== "unknown episode"
          ? epObj.name.trim()
          : "";
      const validWatchSeasons = (this.currentShow?.seasons || []).filter((s) =>
        this.isSeasonAired(s),
      );
      const isCombinedWatch = Boolean(
        this.watchState.isAnime &&
        validWatchSeasons.length <= 1 &&
        this.watchState.targetSeason,
      );
      const curShowId = String(
        this.currentShow?.id || this.watchState?.id || "",
      );
      const animeInfo = this.getShowAnimeInfo(
        curShowId,
        season > 0 ? season : 1,
      );
      const hybridList =
        this.watchState.isAnime &&
        validWatchSeasons.length > 1 &&
        animeInfo?.sequelChain?.length > validWatchSeasons.length
          ? this.buildHybridSeasonList(
              validWatchSeasons,
              animeInfo.sequelChain,
              this.currentShow,
            )
          : null;
      let activeSpecialEp = null;
      const activeHybrid = hybridList
        ? hybridList.find((h) => {
            if (h._tmdbSeason !== this.watchState.season) return false;
            if (h._isSpecialGroup) {
              const rememberedS = targetHybridSeason
                ? parseInt(targetHybridSeason, 10)
                : parseInt(this.showSeasons[id], 10);
              if (
                rememberedS &&
                h.season_number !== rememberedS &&
                hybridList.some(
                  (o) => o._isSpecialGroup && o.season_number === rememberedS,
                )
              ) {
                return false;
              }
              const specEps = this.resolveSpecialGroupEps(
                sData.episodes,
                h._specialEntries,
                h.season_number,
              );
              const exactHit = specEps.find(
                (se) =>
                  se.episode_number === this.watchState.episode ||
                  se._relEp === this.watchState.episode ||
                  se._aniEp === this.watchState.episode,
              );
              const targetIdx =
                this.watchState.episode > 0 &&
                this.watchState.episode <= specEps.length
                  ? this.watchState.episode - 1
                  : 0;
              const hit =
                exactHit ||
                (rememberedS === h.season_number ||
                !hybridList.some((o) => o._isSpecialGroup && o !== h)
                  ? specEps[targetIdx] || specEps[0]
                  : null);
              if (hit) {
                activeSpecialEp = hit;
                this.watchState.episode = hit.episode_number;
                episode = hit.episode_number;
                return true;
              }
              return false;
            }
            return (
              this.watchState.episode >= (h._epStart || 1) &&
              this.watchState.episode <= (h._epEnd || 99999)
            );
          })
        : null;
      if (activeSpecialEp && activeSpecialEp._aniEntry) {
        let chosenEntry = activeSpecialEp._aniEntry;
        let chosenEp = activeSpecialEp._aniEp || activeSpecialEp._relEp || 1;
        const parentEntry =
          activeHybrid &&
          Array.isArray(activeHybrid._specialEntries) &&
          activeHybrid._specialEntries[0]
            ? activeHybrid._specialEntries[0]
            : activeHybrid?._aniEntry || chosenEntry;
        const parentMalId =
          parentEntry &&
          parentEntry.idMal &&
          parentEntry.idMal !== parentEntry.id
            ? parentEntry.idMal
            : parentEntry?.idMal || null;
        const hasExplicit = Boolean(
          chosenEntry.hasExplicitMal ||
          (chosenEntry.idMal && chosenEntry.idMal !== chosenEntry.id),
        );
        let finalMalId = hasExplicit
          ? chosenEntry.idMal
          : parentMalId || chosenEntry.idMal || chosenEntry.id;
        let finalAnimeEp = chosenEp;
        if (!hasExplicit && parentMalId && (activeSpecialEp._relEp || 1) > 1) {
          finalAnimeEp = activeSpecialEp._relEp || chosenEp;
        }
        this.watchState.aniId = chosenEntry.id;
        this.watchState.malId = finalMalId;
        this.watchState.animeFormat = chosenEntry.format || "SPECIAL";
        this.watchState.animeEp = finalAnimeEp;
      } else if (activeHybrid && activeHybrid._aniEntry) {
        this.watchState.aniId = activeHybrid._aniEntry.id;
        this.watchState.malId =
          activeHybrid._aniEntry.idMal || activeHybrid._aniEntry.id;
        this.watchState.animeFormat =
          activeHybrid._aniEntry.format || this.watchState.animeFormat;
        this.watchState.animeEp = activeHybrid._isSpecialGroup
          ? Math.max(
              1,
              this.watchState.episode > 9000
                ? this.watchState.episode % 10
                : this.watchState.episode,
            )
          : this.watchState.episode -
            (activeHybrid._epStart || 1) +
            1 +
            (activeHybrid._aniEpOffset || 0);
      }
      const cardSNum = activeHybrid
        ? activeHybrid.season_number
        : isCombinedWatch
          ? this.watchState.dispSeason || this.watchState.targetSeason
          : season;
      const dispSeason =
        activeHybrid && activeHybrid._tmdbSeason !== undefined
          ? activeHybrid._tmdbSeason
          : isCombinedWatch
            ? this.watchState.dispSeason || this.watchState.targetSeason
            : season;
      const dispEp = activeSpecialEp
        ? activeSpecialEp._relEp || 1
        : isCombinedWatch
          ? this.watchState.dispEp !== undefined &&
            this.watchState.dispEp !== null
            ? this.watchState.dispEp
            : episode
          : episode;
      if (activeHybrid || isCombinedWatch) {
        this.showSeasons[id] = cardSNum;
        this.$storeSet("showSeasons", this.showSeasons);
      }
      const sPad = String(dispSeason).padStart(2, "0");
      const ePad = String(dispEp).padStart(2, "0");
      const isSpecialWatch = Boolean(
        activeSpecialEp ||
        (activeHybrid && activeHybrid._isSpecialGroup) ||
        dispSeason === 0 ||
        (this.watchState.isAnime &&
          (this.currentShow?.format === "OVA" ||
            this.currentShow?.format === "SPECIAL" ||
            this.currentShow?.type === "OVA" ||
            this.currentShow?.type === "Special" ||
            this.watchState.animeFormat === "OVA" ||
            this.watchState.animeFormat === "SPECIAL" ||
            animeInfo?.animeFormat === "OVA" ||
            animeInfo?.animeFormat === "SPECIAL")),
      );
      let cleanEpName = null;
      if (isSpecialWatch) {
        const specEpName =
          activeSpecialEp &&
          activeSpecialEp.name &&
          activeSpecialEp.name.trim() &&
          activeSpecialEp.name.trim().toLowerCase() !== "unknown episode"
            ? activeSpecialEp.name.trim()
            : null;
        cleanEpName = specEpName || rawEpName || `Episode ${dispEp}`;
        const normTitle = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normClean = cleanEpName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const alreadyHasTitle = normTitle && normClean.startsWith(normTitle);
        headerText = alreadyHasTitle
          ? cleanEpName
          : `${title} - ${cleanEpName}`;
        pageTitle = headerText;
      } else {
        const epPrefix = `S${sPad}E${ePad}`;
        headerText = rawEpName
          ? `${title} ${epPrefix} ${rawEpName}`
          : `${title} ${epPrefix}`;
        pageTitle = rawEpName
          ? `${title} ${epPrefix} ${rawEpName}`
          : `${title} ${epPrefix}`;
      }
      if (type === "tv") {
        const hist = this.getHistory();
        const histEntry = hist.find((x) => String(x.id) === String(id));
        if (histEntry) {
          histEntry.last_season = this.watchState.season;
          histEntry.last_episode = this.watchState.episode;
          if (isSpecialWatch) {
            histEntry.last_ep_name = cleanEpName;
            histEntry.is_special = true;
          } else {
            histEntry.is_special = false;
            if (rawEpName) histEntry.last_ep_name = rawEpName;
          }
          if (cardSNum !== undefined && cardSNum !== null)
            histEntry.last_hybrid_season = cardSNum;
          else if (targetHybridSeason)
            histEntry.last_hybrid_season = parseInt(targetHybridSeason, 10);
          this.setHistory(hist);
        }
        this.saveEpisodeHistory(
          this.currentShow,
          this.watchState.season,
          this.watchState.episode,
          epObj,
          activeSpecialEp,
          isSpecialWatch,
          cleanEpName || rawEpName,
          cardSNum ||
            (targetHybridSeason ? parseInt(targetHybridSeason, 10) : null),
          dispSeason,
          dispEp,
        );
      }
      const sSel = this.$g("w-season-sel");
      const seasons = validWatchSeasons;
      const cSeasons =
        isCombinedWatch && animeInfo?.sequelChain
          ? [...new Set(animeInfo.sequelChain.map((s) => s.season || 1))]
          : [];
      if (activeHybrid && hybridList) {
        sSel.innerHTML = hybridList
          .map(
            (h) =>
              `<option value="hyb_${h.season_number}" ${h.season_number === cardSNum ? "selected" : ""}>${h.name || "Season " + h.season_number}</option>`,
          )
          .join("");
      } else if (isCombinedWatch && cSeasons.length > 1) {
        sSel.innerHTML = cSeasons
          .map(
            (cs) =>
              `<option value="virt_${cs}" ${cs === dispSeason ? "selected" : ""}>Season ${cs}</option>`,
          )
          .join("");
      } else {
        const allSeasons =
          this.watchState.season === 0 &&
          this.currentShow?.seasons?.some((s) => s.season_number === 0) &&
          !seasons.some((s) => s.season_number === 0)
            ? [
                this.currentShow.seasons.find((s) => s.season_number === 0),
                ...seasons,
              ]
            : seasons;
        sSel.innerHTML = allSeasons
          .map(
            (s) =>
              `<option value="${s.season_number}" ${s.season_number === this.watchState.season ? "selected" : ""}>${(s.name && s.name.trim()) || "Season " + s.season_number}</option>`,
          )
          .join("");
      }
      const epSel = this.$g("w-ep-sel");
      if (sData.episodes) {
        const epsList =
          activeHybrid && activeHybrid._isSpecialGroup
            ? this.resolveSpecialGroupEps(
                sData.episodes,
                activeHybrid._specialEntries,
                activeHybrid.season_number,
              )
            : activeHybrid
              ? sData.episodes.filter(
                  (e) =>
                    e.episode_number >= (activeHybrid._epStart || 1) &&
                    e.episode_number <= (activeHybrid._epEnd || 99999),
                )
              : isCombinedWatch && cSeasons.length > 1
                ? sData.episodes.filter(
                    (e) =>
                      this.resolveAnimeSequelEp(
                        e.episode_number,
                        animeInfo.sequelChain,
                      ).season === dispSeason,
                  )
                : sData.episodes;
        if (epsList && epsList.length > 0) {
          this.watchState.seasonEpList = epsList.map((e) => e.episode_number);
          this.watchState.epCount =
            this.watchState.seasonEpList[
              this.watchState.seasonEpList.length - 1
            ];
        }
        epSel.innerHTML = epsList
          .map((e) => {
            const epN =
              activeHybrid && activeHybrid._isSpecialGroup
                ? e._relEp || 1
                : isCombinedWatch && cSeasons.length > 1
                  ? this.resolveAnimeSequelEp(
                      e.episode_number,
                      animeInfo.sequelChain,
                    ).ep
                  : e.episode_number;
            const optLabel =
              isSpecialWatch &&
              e.name &&
              e.name.trim() &&
              e.name.trim().toLowerCase() !== "unknown episode"
                ? e.name.trim()
                : `Episode ${epN}${e.name && e.name.trim() && e.name.trim().toLowerCase() !== "unknown episode" ? " - " + e.name.trim() : ""}`;
            return `<option value="${e.episode_number}" ${e.episode_number === this.watchState.episode ? "selected" : ""}>${optLabel}</option>`;
          })
          .join("");
      }
      this.$g("w-menu-btn").style.display = "inline-flex";
      this.$g("w-prev-btn").style.display = "inline-flex";
      this.$g("w-next-btn").style.display = "inline-flex";
      this.$g("w-prev-btn").disabled =
        this.watchState.season <= 1 && this.watchState.episode <= 1;
      const maxSeason =
        seasons.length > 0
          ? Math.max(...seasons.map((s) => s.season_number))
          : this.watchState.season;
      this.$g("w-next-btn").disabled =
        this.watchState.season >= maxSeason &&
        this.watchState.episode >= this.watchState.epCount;
      if (
        this.watchState.episode >= this.watchState.epCount &&
        this.watchState.season < maxSeason
      ) {
        const nextS = this.watchState.season + 1;
        const prefetchNextSeason = () => {
          if (this.currentView === "watch" && this.watchState.id === id) {
            this.fetchSeasonEpisodes(id, nextS).catch(() => {});
          }
        };
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(prefetchNextSeason, { timeout: 3000 });
        } else {
          setTimeout(prefetchNextSeason, 1500);
        }
      }
    } else {
      const mYear = this.getItemYear(this.currentShow);
      headerText = mYear ? `${title} (${mYear})` : title;
      pageTitle = headerText;
      ["w-menu-btn", "w-prev-btn", "w-next-btn"].forEach((k) => {
        const el = this.$g(k);
        if (el) el.style.display = "none";
      });
    }
    const wt = this.$g("w-title");
    if (wt) {
      wt.innerText = headerText;
      wt.classList.toggle(
        "is-long",
        headerText.length > 55 && headerText.length <= 90,
      );
      wt.classList.toggle("is-extra-long", headerText.length > 90);
    }
    if (currentWatchReqId !== this.watchReqId || this.currentView !== "watch")
      return;
    document.title = pageTitle;
    const url = `?view=watch&type=${type}&id=${id}&season=${season}&episode=${episode}`;
    this.syncHistoryUrl(
      { view: "watch", id, type, season, episode },
      pageTitle,
      url,
      pushState,
      replaceState,
    );
    setTimeout(() => {
      if (currentWatchReqId !== this.watchReqId || this.currentView !== "watch")
        return;
      this.updateIframeSrc();
    }, 50);
    this.stopLoader();
  },
  refreshPlayer: function () {
    window.location.reload();
  },
  updateIframeSrc: function () {
    if (this.currentView !== "watch") return;
    const iframe = this.$g("main-iframe");
    if (!iframe) return;
    let src = "";
    const sId = this.$g("w-server-num-sel")
      ? this.$g("w-server-num-sel").value
      : "1";
    const customObj = (this.customServers || []).find((s) => s.id === sId);
    if (customObj) {
      const playId = this.watchState.id || this.watchState.imdbId || "";
      const params = {
        tmdb_id: this.watchState.id || "",
        imdb_id: this.watchState.imdbId || "",
        imdb: this.watchState.imdbId || "",
        id: playId,
        season: this.watchState.season || 1,
        s: this.watchState.season || 1,
        episode: this.watchState.episode || 1,
        e: this.watchState.episode || 1,
        type: this.watchState.type || "movie",
        mal_id: this.watchState.malId || "",
        ani_id: this.watchState.aniId || "",
      };
      src = customObj.urlTemplate.replace(/\{(\w+)\}/g, (m, k) =>
        params[k] !== undefined ? params[k] : "",
      );
    } else if (this.watchState && this.watchState.isAnime) {
      const malId = this.watchState.malId;
      const aniId = this.watchState.aniId;
      const ep =
        this.watchState.type === "tv"
          ? this.watchState.animeEp || this.watchState.episode || 1
          : 1;
      const typeSel = this.$g("w-player-type-sel");
      const curVariant =
        (typeSel ? typeSel.value : null) ||
        this.$storeGet("preferredAnimeVariant", "sub") ||
        "sub";
      const group =
        (animeServers && animeServers[curVariant]) ||
        (animeServers && animeServers.sub) ||
        {};
      const srvObj = group[sId] || group["1"];
      if (srvObj && typeof srvObj.url === "function") {
        src = srvObj.url(malId, aniId, ep);
      }
    } else {
      const player = embedServers[sId] || embedServers["1"];
      if (player) {
        const playId = this.watchState.id || this.watchState.imdbId;
        if (this.watchState.type === "tv")
          src = player.tv(
            playId,
            this.watchState.season,
            this.watchState.episode,
          );
        else src = player.movie(playId);
        if (
          src &&
          this.watchState &&
          this.watchState.id &&
          !player.skipStartAt
        ) {
          const pKey =
            this.watchState.type === "tv"
              ? `progress_${this.watchState.id}_s${this.watchState.season}_e${this.watchState.episode}`
              : `progress_${this.watchState.id}`;
          const savedProg = parseFloat(this.getWatchProgress(pKey) || 0);
          if (savedProg > 10) {
            const sep = src.includes("?") ? "&" : "?";
            src += `${sep}startAt=${Math.floor(savedProg)}`;
          }
        }
      }
    }
    if (iframe) {
      try {
        if (iframe.contentWindow) iframe.contentWindow.location.replace(src);
        else iframe.src = src;
      } catch (e) {
        iframe.src = src;
      }
      if (this._autoNextResetTimer) clearTimeout(this._autoNextResetTimer);
      this._autoNextResetTimer = setTimeout(() => {
        this.autoNextTriggered = false;
      }, 3000);
    }
  },
  async watchNextPrev(dir) {
    if (!this.currentShow) return;
    const seasons = (this.currentShow.seasons || []).filter((s) =>
      this.isSeasonAired(s),
    );
    const maxSeason =
      seasons.length > 0
        ? Math.max(...seasons.map((s) => s.season_number))
        : this.watchState.season;
    const epList = this.watchState.seasonEpList || [];
    const curEpNum = Number(this.watchState.episode);
    const curIdx = epList.findIndex((e) => Number(e) === curEpNum);
    if (curIdx !== -1) {
      const targetIdx = curIdx + dir;
      if (targetIdx >= 0 && targetIdx < epList.length) {
        this.openWatch(
          this.watchState.id,
          this.watchState.type,
          this.watchState.season,
          epList[targetIdx],
          true,
          false,
          this.showSeasons[this.watchState.id],
        );
        return;
      }
    } else if (curEpNum > 0 && this.watchState.epCount > 0) {
      const candidateEp = curEpNum + dir;
      if (candidateEp >= 1 && candidateEp <= this.watchState.epCount) {
        this.openWatch(
          this.watchState.id,
          this.watchState.type,
          this.watchState.season,
          candidateEp,
          true,
          false,
          this.showSeasons[this.watchState.id],
        );
        return;
      }
    }
    const curShowId = String(this.currentShow?.id || this.watchState?.id || "");
    const animeInfo = this.getShowAnimeInfo
      ? this.getShowAnimeInfo(curShowId, 1)
      : null;
    const isAnimeShow = Boolean(
      this.watchState.isAnime ||
      (this.isAnimeItem && this.isAnimeItem(this.currentShow)),
    );
    const hybridList =
      isAnimeShow &&
      seasons.length > 1 &&
      animeInfo?.sequelChain?.length > seasons.length &&
      this.buildHybridSeasonList
        ? this.buildHybridSeasonList(
            seasons,
            animeInfo.sequelChain,
            this.currentShow,
          )
        : null;
    if (hybridList && hybridList.length > 1) {
      const curHybS = parseInt(
        this.showSeasons[this.watchState.id] || this.watchState.season,
        10,
      );
      const curHybIdx = hybridList.findIndex(
        (h) => h.season_number === curHybS,
      );
      if (curHybIdx !== -1) {
        const nextHybIdx = curHybIdx + dir;
        if (nextHybIdx >= 0 && nextHybIdx < hybridList.length) {
          const targetH = hybridList[nextHybIdx];
          const targetEp = targetH._isSpecialGroup
            ? 1
            : dir === 1
              ? targetH._epStart || 1
              : targetH._epEnd || targetH._epStart || 1;
          this.openWatch(
            this.watchState.id,
            this.watchState.type,
            targetH._tmdbSeason,
            targetEp,
            true,
            false,
            targetH.season_number,
          );
          return;
        }
      }
    }
    const isCombinedWatch = Boolean(
      isAnimeShow &&
      seasons.length <= 1 &&
      animeInfo?.sequelChain &&
      animeInfo.sequelChain.length > 1,
    );
    if (isCombinedWatch) {
      const cSeasons = [
        ...new Set(animeInfo.sequelChain.map((s) => s.season || 1)),
      ];
      const curVirtS = parseInt(
        this.watchState.dispSeason || this.showSeasons[this.watchState.id] || 1,
        10,
      );
      const vIdx = cSeasons.indexOf(curVirtS);
      if (vIdx !== -1) {
        const nextVIdx = vIdx + dir;
        if (nextVIdx >= 0 && nextVIdx < cSeasons.length) {
          const nextVirtS = cSeasons[nextVIdx];
          let rawEp = 1;
          let off = 0;
          for (const entry of animeInfo.sequelChain) {
            if ((entry.season || 1) === nextVirtS) {
              rawEp = dir === 1 ? off + 1 : off + (entry.episodes || 1);
              break;
            }
            off += entry.episodes || 0;
          }
          this.showSeasons[this.watchState.id] = nextVirtS;
          this.$storeSet("showSeasons", this.showSeasons);
          this.openWatch(
            this.watchState.id,
            this.watchState.type,
            this.watchState.season || 1,
            rawEp,
          );
          return;
        }
      }
    }
    let nextS = this.watchState.season + dir;
    if ((dir === 1 && nextS <= maxSeason) || (dir === -1 && nextS >= 1)) {
      const sData = await this.fetchSeasonEpisodes(this.watchState.id, nextS);
      const eps = (sData && sData.episodes) || [];
      const targetEp =
        dir === 1
          ? eps[0]?.episode_number || 1
          : eps[eps.length - 1]?.episode_number || 1;
      this.openWatch(this.watchState.id, this.watchState.type, nextS, targetEp);
    }
  },
  playTrailer: function (ytKey) {
    const iframe = this.$g("trailer-iframe");
    const loader = this.$g("trailer-loader");
    if (loader) loader.style.display = "flex";
    if (iframe) {
      if (this.trailerTimer) clearTimeout(this.trailerTimer);
      iframe.onload = () => {
        if (!iframe.src || iframe.src === "about:blank") return;
        this.trailerTimer = setTimeout(() => {
          const l = this.$g("trailer-loader");
          if (l) l.style.display = "none";
        }, 1000);
      };
      iframe.src = `https://www.youtube-nocookie.com/embed/${ytKey}?autoplay=1&rel=0&enablejsapi=1`;
    }
    this.toggleAppModal("trailer", true);
  },
  openMediaLightbox: function (url) {
    if (!url) return;

    const loader = this.$g("media-lightbox-loader");
    if (loader) loader.style.display = "flex";

    const modal = this.$g("media-lightbox-modal");
    const img = this.$g("media-lightbox-img");
    if (img) {
      img.style.visibility = "visible";
      img.style.opacity = "";
      img.classList.remove("loaded");
      img.onload = () => {
        if (loader) loader.style.display = "none";
        img.classList.add("loaded");
        img.style.visibility = "visible";
      };
      img.src = url;
      img.onerror = () => {
        if (loader) loader.style.display = "none";
      };
      if (img.complete && img.naturalWidth > 0) {
        if (loader) loader.style.display = "none";
        img.classList.add("loaded");
        img.style.visibility = "visible";
      }
    }
    if (modal) {
      modal.classList.add("active");
      document.body.classList.add("modal-open");
      if (
        !window.history.state ||
        window.history.state.modal !== "media_lightbox"
      ) {
        window.history.pushState(
          {
            modal: "media_lightbox",
            view: this.currentView,
          },
          "",
          window.location.href,
        );
      }
    }
  },
  closeMediaLightbox(e, fromPop = false) {
    const loader = this.$g("media-lightbox-loader");
    if (loader) loader.style.display = "none";
    if (
      e &&
      e.target &&
      e.target.closest &&
      e.target.closest(".media-lightbox-content")
    )
      return;
    const modal = this.$g("media-lightbox-modal");
    if (!modal || !modal.classList.contains("active")) return;
    if (
      !fromPop &&
      window.history.state &&
      window.history.state.modal === "media_lightbox"
    ) {
      window.history.back();
      return;
    }
    modal.classList.remove("active");
    const img = this.$g("media-lightbox-img");
    if (img) {
      img.classList.remove("loaded");
      img.src = "";
    }
    this.syncModalOpen();
  },
  async fetchMovieMedia(movieData) {
    if (!movieData) return [];
    const mId = String(movieData.id || "");
    if (mId.startsWith("ani_") || movieData.is_anilist) return [];
    const isTv =
      movieData.media_type === "tv" ||
      (!movieData.title && !!movieData.name) ||
      Array.isArray(movieData.seasons) ||
      !!movieData.first_air_date;
    const typePrefix = isTv ? "tv" : "movie";
    const cacheKey = `${typePrefix}_${mId}`;
    if (!this.movieMediaCache)
      this.movieMediaCache = this.$sessGet("str_c_moviemedia", {}) || {};
    const hit =
      this.lruGet(this.movieMediaCache, cacheKey) ||
      this.lruGet(this.movieMediaCache, mId);
    if (hit) return hit;
    const results = [];
    const seenUrls = new Set();
    const addArt = (path, tag, isFull = false) => {
      if (!path || typeof path !== "string") return;
      let fullUrl = "";
      let thumbUrl = "";
      if (isFull || path.startsWith("http")) {
        fullUrl = path;
        thumbUrl = path;
      } else {
        const cleanPath = path.startsWith("/") ? path : "/" + path;
        fullUrl = `${IMG_BASE}original${cleanPath}`;
        thumbUrl = `${IMG_BASE}w780${cleanPath}`;
      }
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);
      results.push({ url: fullUrl, thumb: thumbUrl, tag: tag || "Art" });
    };
    const detailsEntry =
      this.getShowDetailsCache(`${typePrefix}_${mId}`) ||
      this.getShowDetailsCache(`tv_${mId}`) ||
      this.getShowDetailsCache(`movie_${mId}`) ||
      this.getShowDetailsCache(mId);
    const details = detailsEntry?.data || null;
    const addImgs = (src) =>
      [
        ["backdrops", "Backdrop"],
        ["posters", "Poster"],
        ["logos", "Logo"],
      ].forEach(([k, tag]) =>
        (src?.[k] || []).forEach(
          (x) => x?.file_path && addArt(x.file_path, tag),
        ),
      );
    const existingImgs =
      movieData.images &&
      (movieData.images.backdrops || movieData.images.posters)
        ? movieData.images
        : details?.images || null;
    if (
      existingImgs &&
      (existingImgs.backdrops?.length || 0) +
        (existingImgs.posters?.length || 0) >=
        6
    ) {
      addImgs(existingImgs);
    }
    if (results.length < 6) {
      let tmdbId = movieData.id;
      if (typeof tmdbId === "string" && tmdbId.startsWith("tt")) {
        try {
          const fJson = await this.api(
            `/find/${tmdbId}`,
            { external_source: "imdb_id" },
            this.getTmdbMediaKey(),
          );
          const found =
            (isTv
              ? fJson.tv_results && fJson.tv_results[0]
              : fJson.movie_results && fJson.movie_results[0]) ||
            (fJson.tv_results && fJson.tv_results[0]) ||
            (fJson.movie_results && fJson.movie_results[0]) ||
            null;
          if (found) tmdbId = found.id;
        } catch (e) {}
      }
      if (tmdbId && !String(tmdbId).startsWith("ani_")) {
        try {
          const imgEndpoint = isTv
            ? `/tv/${tmdbId}/images`
            : `/movie/${tmdbId}/images`;
          const imgData = await this.api(
            imgEndpoint,
            { include_image_language: "en,null,ja,ko,zh" },
            this.getTmdbMediaKey(),
          );
          if (imgData) addImgs(imgData);
        } catch (e) {}
      }
    }
    if (results.length === 0) {
      if (
        movieData.backdrop_path &&
        typeof movieData.backdrop_path === "string" &&
        movieData.backdrop_path.startsWith("/")
      )
        addArt(movieData.backdrop_path, "Backdrop");
      if (
        movieData.poster_path &&
        typeof movieData.poster_path === "string" &&
        movieData.poster_path.startsWith("/")
      )
        addArt(movieData.poster_path, "Poster");
    }
    this.lruSet(this.movieMediaCache, cacheKey, results, null, 40);
    this.$sessSet("str_c_moviemedia", this.movieMediaCache);
    return results;
  },
  renderMovieMediaSet(pageIdx) {
    const grid = this.$g("si-media-grid");
    const counter = this.$g("si-media-counter");
    const prevBtn = this.$g("si-media-prev");
    const nextBtn = this.$g("si-media-next");
    if (!grid) return;
    const total = this.movieMediaState.items.length;
    if (total === 0) {
      grid.innerHTML = '<div class="si-media-empty">No media available</div>';
      if (counter) counter.innerText = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    const capacity = this.getMediaPageCapacity();
    grid.setAttribute("data-count", String(capacity));
    const totalPages = Math.ceil(total / capacity);
    let page = pageIdx;
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;
    this.movieMediaState.page = page;
    const start = page * capacity;
    const currentSet = this.movieMediaState.items.slice(
      start,
      start + capacity,
    );
    const sec = this.$g("si-media-section");
    this.animateHeight(sec, () => {
      grid.innerHTML = currentSet
        .map(
          (item) => `
<div class="si-media-card pop-in" onclick="app.openMediaLightbox('${item.url}')">
<img src="${item.thumb || item.url}" alt="Art" loading="lazy" onload="this.classList.add('loaded')" onerror="this.parentElement.remove()">
</div>
`,
        )
        .join("");
    });
    if (counter)
      counter.innerText =
        totalPages > 1 ? `${page + 1} / ${totalPages}` : `${total} items`;
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = page >= totalPages - 1;
  },
  async openMovieMedia() {
    if (
      !this.currentShow ||
      String(this.currentShow.id).startsWith("ani_") ||
      this.currentShow.is_anilist
    )
      return;
    const triggerWrap = this.$g("si-media-trigger-wrap");
    const mediaGrid = this.$g("si-media-grid");
    const navControls = this.$g("si-media-nav-controls");
    const closeBtn = this.$g("si-gallery-close-btn");

    this.movieMediaState.active = true;
    const sec = this.$g("si-media-section");
    const renderInitMedia = (mediaItems) => {
      this.movieMediaState.items = mediaItems;
      this.movieMediaState.id = this.currentShow.id;
      this.movieMediaState.page = 0;
      const capacity = this.getMediaPageCapacity();
      if (mediaGrid) {
        mediaGrid.setAttribute("data-count", String(capacity));
        const currentSet = mediaItems.slice(0, capacity);
        mediaGrid.innerHTML = currentSet
          .map(
            (item) => `
<div class="si-media-card pop-in" onclick="app.openMediaLightbox('${item.url}')">
<img src="${item.thumb || item.url}" alt="Art" loading="lazy" onload="this.classList.add('loaded')" onerror="this.parentElement.remove()">
</div>
`,
          )
          .join("");
      }
      const counter = this.$g("si-media-counter");
      const totalPages = Math.ceil(mediaItems.length / capacity);
      if (counter)
        counter.innerText =
          totalPages > 1 ? `1 / ${totalPages}` : `${mediaItems.length} items`;
      const prevBtn = this.$g("si-media-prev");
      const nextBtn = this.$g("si-media-next");
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = totalPages <= 1;
    };
    if (
      this.movieMediaState.id === this.currentShow.id &&
      this.movieMediaState.items.length > 0
    ) {
      this.animateHeight(sec, () => {
        if (triggerWrap) triggerWrap.style.display = "none";
        if (mediaGrid) mediaGrid.style.display = "grid";
        if (navControls) navControls.style.display = "inline-flex";
        if (closeBtn) {
          if (
            !closeBtn.querySelector("svg") &&
            typeof STATIC_ICONS !== "undefined" &&
            STATIC_ICONS["back-seasons"]
          ) {
            closeBtn.insertAdjacentHTML(
              "afterbegin",
              STATIC_ICONS["back-seasons"],
            );
          }
          closeBtn.style.display = "inline-flex";
        }
        renderInitMedia(this.movieMediaState.items);
      });
      return;
    }
    if (mediaGrid)
      mediaGrid.innerHTML =
        '<div class="si-media-loading">Loading media...</div>';
    const counter = this.$g("si-media-counter");
    if (counter) counter.innerText = "";
    const items = await this.fetchMovieMedia(this.currentShow);
    if (!items || items.length === 0) {
      this.closeMovieMedia();
      if (sec) sec.style.display = "none";
      return;
    }
    if (!this.movieMediaState.active || !this.currentShow) return;
    this.animateHeight(sec, () => {
      if (triggerWrap) triggerWrap.style.display = "none";
      if (mediaGrid) mediaGrid.style.display = "grid";
      if (navControls) navControls.style.display = "inline-flex";
      if (closeBtn) {
        if (
          !closeBtn.querySelector("svg") &&
          typeof STATIC_ICONS !== "undefined" &&
          STATIC_ICONS["back-seasons"]
        ) {
          closeBtn.insertAdjacentHTML(
            "afterbegin",
            STATIC_ICONS["back-seasons"],
          );
        }
        closeBtn.style.display = "inline-flex";
      }
      renderInitMedia(items);
    });
  },
  closeMovieMedia() {
    this.movieMediaState.active = false;
    const sec = this.$g("si-media-section");
    const triggerWrap = this.$g("si-media-trigger-wrap");
    const mediaGrid = this.$g("si-media-grid");
    const navControls = this.$g("si-media-nav-controls");
    const closeBtn = this.$g("si-gallery-close-btn");
    this.animateHeight(sec, () => {
      if (closeBtn) closeBtn.style.display = "none";
      if (navControls) navControls.style.display = "none";
      if (mediaGrid) mediaGrid.style.display = "none";
      if (triggerWrap) triggerWrap.style.display = "grid";
    });
  },
  toggleMovieMedia() {
    if (this.movieMediaState.active) {
      this.closeMovieMedia();
    } else {
      this.openMovieMedia();
    }
  },
  openPerson: async function (
    personId,
    pushState = true,
    replaceState = false,
    department = "Acting",
  ) {
    if (!personId) return;
    const pGrid = this.$g("person-filmography-grid");
    const pContent = this.$g("person-content-wrap");
    const pLoader = this.$g("person-unified-loader");
    if (
      !pushState &&
      String(this.currentPersonId) === String(personId) &&
      pGrid &&
      pGrid.children &&
      pGrid.children.length > 0
    ) {
      this.currentView = "person";
      this.setActiveView("person", null);
      this.updateBackBtn("person");
      if (pLoader) pLoader.style.display = "none";
      if (pContent) pContent.style.display = "block";
      if (this.personScrollPos > 0) {
        this.restoreScroll(this.personScrollPos);
        this.personScrollPos = 0;
      }
      return;
    }
    if (
      this.currentView === "people" ||
      this.currentView === "companies" ||
      (this.currentView === "explore" &&
        this.$g("explore-catalog")?.style.display !== "none")
    ) {
      if (!this.exploreScrollPos) this.exploreScrollPos = {};
      this.exploreScrollPos[this.exploreType || "person"] = this.getScrollY();
      this.returnFromShowinfoToExplore = true;
    } else if (
      this.currentView === "showinfo" ||
      this.currentView === "movies" ||
      this.currentView === "shows" ||
      this.currentView === "series"
    ) {
      this.resetExploreRandom();
    }
    this.currentPersonId = personId;
    let normDept = (department || "Acting").trim();
    if (normDept) {
      normDept =
        normDept.charAt(0).toUpperCase() + normDept.slice(1).toLowerCase();
    }
    if (!normDept || normDept.toLowerCase() === "acting") {
      normDept = "Acting";
    }
    this.currentPersonDept = normDept;
    this.personYearSort = "desc";
    this.currentView = "person";
    this.setActiveView("person", null);
    this.updateBackBtn("person");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const unifiedLoader = this.$g("person-unified-loader");
    const contentWrap = this.$g("person-content-wrap");
    if (unifiedLoader) unifiedLoader.style.display = "flex";
    if (contentWrap) contentWrap.style.display = "none";
    const bioName = this.$g("person-bio-name");
    const bioText = this.$g("person-bio-text");
    const bioPic = this.$g("person-bio-pic");
    const bioPlaceholder = this.$g("person-bio-placeholder");
    const grid = this.$g("person-filmography-grid");
    const filmHeading = this.$g("person-filmography-title");
    const deptTitle =
      this.currentPersonDept === "Acting" || !this.currentPersonDept
        ? "Filmography"
        : this.currentPersonDept;
    if (filmHeading) filmHeading.textContent = deptTitle;
    if (bioName) bioName.textContent = "";
    if (bioText) bioText.textContent = "";
    if (bioPic) {
      bioPic.style.display = "none";
      bioPic.removeAttribute("src");
    }
    if (bioPlaceholder) bioPlaceholder.style.display = "flex";
    if (grid) grid.innerHTML = "";
    const descBtn = this.$g("person-year-sort-desc-btn");
    const ascBtn = this.$g("person-year-sort-asc-btn");
    if (descBtn) descBtn.classList.add("active");
    if (ascBtn) ascBtn.classList.remove("active");
    this.personYearSort = "desc";
    this.personTypeFilter = "all";
    const pfbAll = this.$g("pfb-all");
    const pfbMov = this.$g("pfb-movie");
    const pfbTv = this.$g("pfb-tv");
    if (pfbAll) pfbAll.classList.add("active");
    if (pfbMov) pfbMov.classList.remove("active");
    if (pfbTv) pfbTv.classList.remove("active");
    this.personFilterExpanded = false;
    if (this.personMulti) {
      this.personFilterKeys.forEach((k) => {
        this.personMulti[k] = [];
      });
    }
    const pfWrap = this.$g("person-catalog-filter-bar");
    if (pfWrap) {
      pfWrap.style.display = "none";
      pfWrap.classList.add("minimized");
    }
    const pfType = this.$g("pf-type");
    const pfTypeInput = this.$g("pf-type-input");
    const pfTypeClear = this.$g("pf-type-clear");
    if (pfType) pfType.value = "";
    if (pfTypeInput) pfTypeInput.value = "";
    if (pfTypeClear) pfTypeClear.style.display = "none";
    this.updateTypeInputWidth("person");
    this.renderAllFilterTags("person");
    this.updatePersonFilterToggleUI();
    this.personSearchOpen = false;
    this.personSearchQuery = "";
    const pSearchInp = this.$g("person-search-input");
    if (pSearchInp) pSearchInp.value = "";
    this.updateCatalogSearchUI("person");
    const pTitlesHeading = this.$g("person-titles-heading");
    if (pTitlesHeading) {
      pTitlesHeading.textContent = "";
      pTitlesHeading.style.display = "none";
    }
    const pRoleWrap = this.$g("person-role-select-wrap");
    if (pRoleWrap) pRoleWrap.style.display = "none";
    const pRoleSub = this.$g("person-role-subheading");
    if (pRoleSub) {
      pRoleSub.textContent = "";
      pRoleSub.style.display = "none";
    }
    const pHeaderActions = this.$g("person-header-actions");
    if (pHeaderActions) pHeaderActions.style.display = "none";
    const cacheKey = `person_${personId}`;
    if (!this.personCache) this.personCache = {};
    let cached = this.personCache[cacheKey];
    if (!cached) {
      const key = this.getTmdbAnimeKey();
      try {
        const [details, credits] = await Promise.all([
          this.api(`/person/${personId}`, {}, key),
          this.api(`/person/${personId}/combined_credits`, {}, key),
        ]);
        if (details) {
          cached = { details, credits };
          this.personCache[cacheKey] = cached;
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (
      this.currentView !== "person" ||
      String(this.currentPersonId) !== String(personId)
    )
      return;
    if (!cached || !cached.details) {
      if (unifiedLoader) unifiedLoader.style.display = "none";
      if (contentWrap) contentWrap.style.display = "block";
      if (grid)
        grid.innerHTML =
          '<div class="msg-box">Failed to load person details.</div>';
      return;
    }
    const p = cached.details;
    const name = p.name || "Person";
    document.title = name;
    const deptParam =
      this.currentPersonDept && this.currentPersonDept !== "Acting"
        ? "&dept=" + encodeURIComponent(this.currentPersonDept.toLowerCase())
        : "";
    this.syncHistoryUrl(
      { view: "person", id: personId, dept: this.currentPersonDept },
      name,
      `?view=person&id=${personId}${deptParam}`,
      pushState,
      replaceState,
    );
    if (bioName) bioName.textContent = name;
    if (bioText)
      bioText.textContent = p.biography
        ? p.biography.trim()
        : "No biography available.";

    const preloadImg = (src, timeoutMs = 450) =>
      new Promise((resolve) => {
        if (!src) return resolve(false);
        const img = new Image();
        let done = false;
        const finish = (ok) => {
          if (!done) {
            done = true;
            resolve(ok);
          }
        };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = src;
        setTimeout(() => finish(false), timeoutMs);
      });
    const profileImgPromise = p.profile_path
      ? preloadImg(this.getImg(p.profile_path, "poster"), 850)
      : Promise.resolve(false);

    this.resolvePersonRoles(cached.credits);
    const roles = this.personAvailableRoles || [];
    let activeRole = this.currentPersonDept || "Acting";
    const matchedRole = roles.find(
      (r) => r.toLowerCase() === activeRole.toLowerCase(),
    );
    if (matchedRole) {
      activeRole = matchedRole;
    } else if (roles.length > 0) {
      activeRole = roles[0];
    }
    this.currentPersonDept = activeRole;
    if (filmHeading)
      filmHeading.textContent =
        roles.length > 1
          ? "Filmography"
          : activeRole === "Acting" || !activeRole
            ? "Filmography"
            : activeRole;
    this.syncPersonRoleUI(roles, activeRole);
    const targetCredits =
      this.personCreditsByRole && this.personCreditsByRole[activeRole]
        ? this.personCreditsByRole[activeRole]
        : [];
    await this.resolvePersonTvCreditYears(targetCredits);
    if (
      this.currentView !== "person" ||
      String(this.currentPersonId) !== String(personId)
    )
      return;
    this.personCredits = targetCredits;
    this.renderPersonFilmography(targetCredits);

    const initialImgs = grid
      ? Array.from(grid.querySelectorAll("img")).slice(0, 4)
      : [];
    const cardImgPromises = initialImgs.map((img) => preloadImg(img.src));

    const [hasProfile] = await Promise.all([
      profileImgPromise,
      Promise.all(cardImgPromises),
    ]);

    if (
      this.currentView !== "person" ||
      String(this.currentPersonId) !== String(personId)
    )
      return;

    if (bioPic && p.profile_path) {
      bioPic.src = this.getImg(p.profile_path, "poster");
      bioPic.style.display = "block";
      if (bioPlaceholder) bioPlaceholder.style.display = "none";
      bioPic.onerror = function () {
        this.style.display = "none";
        const ph = document.getElementById("person-bio-placeholder");
        if (ph) ph.style.display = "flex";
      };
    } else {
      if (bioPic) bioPic.style.display = "none";
      if (bioPlaceholder) bioPlaceholder.style.display = "flex";
    }
    if (grid) this.markImgsLoaded(grid.querySelectorAll("img"));
    if (unifiedLoader) unifiedLoader.style.display = "none";
    if (contentWrap) contentWrap.style.display = "block";
    if (!pushState && this.personScrollPos > 0) {
      this.restoreScroll(this.personScrollPos);
      this.personScrollPos = 0;
    }
  },
  resolvePersonRoles: function (credits) {
    const byRole = {};
    const seenByRole = {};
    const addCredit = (roleName, c) => {
      if (!c || !c.id || !c.poster_path) return;
      const type = c.media_type || (c.title ? "movie" : "tv");
      if (type !== "movie" && type !== "tv") return;
      if (this.isBlocked && this.isBlocked(c, type)) return;
      if (!byRole[roleName]) {
        byRole[roleName] = [];
        seenByRole[roleName] = new Set();
      }
      const key = `${type}_${c.id}`;
      if (seenByRole[roleName].has(key)) return;
      seenByRole[roleName].add(key);
      byRole[roleName].push(c);
    };
    if (credits && Array.isArray(credits.cast)) {
      credits.cast.forEach((c) => addCredit("Acting", c));
    }
    if (credits && Array.isArray(credits.crew)) {
      credits.crew.forEach((c) => {
        if (!c) return;
        const rawDept = String(c.department || "").trim();
        const rawJob = String(c.job || "").trim();
        let roleName = rawDept;
        if (rawDept.toLowerCase() === "creator" || /creator/i.test(rawJob)) {
          roleName = "Creator";
        } else if (
          rawDept.toLowerCase() === "writing" ||
          /^(?:writer|screenplay|story|characters?|teleplay)\b/i.test(rawJob)
        ) {
          roleName = "Writing";
        } else if (
          rawDept.toLowerCase() === "directing" ||
          /^(?:director|co-director)\b/i.test(rawJob)
        ) {
          roleName = "Directing";
        } else if (!roleName) {
          roleName = rawJob || "Crew";
        }
        addCredit(roleName, c);
      });
    }
    const roles = Object.keys(byRole).sort((a, b) => {
      const diff = byRole[b].length - byRole[a].length;
      if (diff !== 0) return diff;
      if (a === "Acting") return -1;
      if (b === "Acting") return 1;
      return a.localeCompare(b);
    });
    this.personCreditsByRole = byRole;
    this.personAvailableRoles = roles;
    return roles;
  },
  syncPersonRoleUI: function (roles, activeRole) {
    const wrap = this.$g("person-role-select-wrap");
    const sel = this.$g("person-role-select");
    const sub = this.$g("person-role-subheading");
    const hasMulti = Array.isArray(roles) && roles.length > 1;
    if (wrap && sel) {
      if (hasMulti) {
        sel.innerHTML = roles
          .map(
            (r) =>
              '<option value="' +
              r.replace(/"/g, "&quot;") +
              '"' +
              (r === activeRole ? " selected" : "") +
              ">" +
              r +
              "</option>",
          )
          .join("");
        wrap.style.display = "inline-flex";
      } else {
        sel.innerHTML = "";
        wrap.style.display = "none";
      }
    }
    if (sub) {
      if (hasMulti && activeRole) {
        sub.textContent = activeRole;
        sub.style.display = "block";
      } else {
        sub.textContent = "";
        sub.style.display = "none";
      }
    }
  },
  resolvePersonTvCreditYears: async function (targetCredits) {
    const tvCreditsToResolve = (targetCredits || []).filter((c) => {
      const type = c.media_type || (c.title ? "movie" : "tv");
      return (
        type === "tv" &&
        c.credit_id &&
        !c.earliest_air_date &&
        !c.credit_no_year
      );
    });
    if (tvCreditsToResolve.length === 0) return;
    const key = this.getTmdbAnimeKey();
    try {
      const batch = tvCreditsToResolve.slice(0, 12);
      const fetchPromises = batch.map((c) =>
        this.api("/credit/" + c.credit_id, {}, key).catch(() => null),
      );
      const creditDetails = await Promise.race([
        Promise.all(fetchPromises),
        new Promise((resolve) => setTimeout(() => resolve([]), 650)),
      ]);
      if (Array.isArray(creditDetails)) {
        creditDetails.forEach((res, i) => {
          if (res && res.media && batch[i]) {
            let regularEpAirDate = "";
            let specialEpAirDate = "";
            if (Array.isArray(res.media.episodes)) {
              for (const ep of res.media.episodes) {
                if (
                  ep &&
                  ep.air_date &&
                  typeof ep.air_date === "string" &&
                  ep.air_date.length >= 4
                ) {
                  if (ep.season_number !== 0) {
                    if (!regularEpAirDate || ep.air_date < regularEpAirDate)
                      regularEpAirDate = ep.air_date;
                  } else {
                    if (!specialEpAirDate || ep.air_date < specialEpAirDate)
                      specialEpAirDate = ep.air_date;
                  }
                }
              }
            }
            let regularSeaAirDate = "";
            let specialSeaAirDate = "";
            let hasSeason1 = false;
            let hasOnlyLaterSeasons = false;
            if (Array.isArray(res.media.seasons)) {
              let nonZeroCount = 0;
              let laterSeasonCount = 0;
              for (const sea of res.media.seasons) {
                if (sea) {
                  if (sea.season_number === 1) hasSeason1 = true;
                  if (sea.season_number > 1) laterSeasonCount++;
                  if (sea.season_number !== 0) nonZeroCount++;
                  if (
                    sea.air_date &&
                    typeof sea.air_date === "string" &&
                    sea.air_date.length >= 4
                  ) {
                    if (sea.season_number !== 0) {
                      if (
                        !regularSeaAirDate ||
                        sea.air_date < regularSeaAirDate
                      )
                        regularSeaAirDate = sea.air_date;
                    } else {
                      if (
                        !specialSeaAirDate ||
                        sea.air_date < specialSeaAirDate
                      )
                        specialSeaAirDate = sea.air_date;
                    }
                  }
                }
              }
              if (
                nonZeroCount > 0 &&
                laterSeasonCount === nonZeroCount &&
                !hasSeason1
              ) {
                hasOnlyLaterSeasons = true;
              }
            }
            let airDate =
              regularEpAirDate ||
              regularSeaAirDate ||
              specialEpAirDate ||
              specialSeaAirDate ||
              "";
            if (!airDate && !hasOnlyLaterSeasons) {
              airDate = res.media.first_air_date || res.media.air_date || "";
            }
            if (airDate) {
              batch[i].earliest_air_date = airDate;
            } else if (hasOnlyLaterSeasons) {
              batch[i].credit_no_year = true;
            }
          }
        });
      }
    } catch (err) {}
  },
  setPersonCreditRole: async function (role) {
    if (!role || !this.personCreditsByRole || !this.personCreditsByRole[role])
      return;
    this.currentPersonDept = role;
    this.personTypeFilter = "all";
    const pfbAll = this.$g("pfb-all");
    const pfbMov = this.$g("pfb-movie");
    const pfbTv = this.$g("pfb-tv");
    if (pfbAll) pfbAll.classList.add("active");
    if (pfbMov) pfbMov.classList.remove("active");
    if (pfbTv) pfbTv.classList.remove("active");
    const filmHeading = this.$g("person-filmography-title");
    if (filmHeading)
      filmHeading.textContent =
        this.personAvailableRoles && this.personAvailableRoles.length > 1
          ? "Filmography"
          : role === "Acting" || !role
            ? "Filmography"
            : role;
    this.syncPersonRoleUI(this.personAvailableRoles, role);
    const targetCredits = this.personCreditsByRole[role] || [];
    await this.resolvePersonTvCreditYears(targetCredits);
    this.personCredits = targetCredits;
    this.renderPersonFilmography(targetCredits);
  },
  renderPersonFilmography: function (creditsList) {
    const grid = this.$g("person-filmography-grid");
    if (!grid) return;
    if (!creditsList || creditsList.length === 0) {
      grid.innerHTML = '<div class="msg-box">No filmography available.</div>';
      return;
    }
    const filtered = creditsList.filter((c) => {
      if (!c || !c.id || !c.poster_path) return false;
      const type = c.media_type || (c.title ? "movie" : "tv");
      if (type !== "movie" && type !== "tv") return false;
      if (this.isBlocked && this.isBlocked(c, type)) return false;
      return true;
    });
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="msg-box">No filmography available.</div>';
      return;
    }
    const hasMovies = filtered.some(
      (c) => (c.media_type || (c.title ? "movie" : "tv")) === "movie",
    );
    const hasShows = filtered.some(
      (c) => (c.media_type || (c.title ? "movie" : "tv")) === "tv",
    );
    const pFilterBar = this.$g("person-filter-bar");
    if (pFilterBar) {
      pFilterBar.style.display = hasMovies && hasShows ? "inline-flex" : "none";
    }
    let birthYear = 0;
    const cached =
      this.personCache && this.personCache["person_" + this.currentPersonId];
    if (cached && cached.details && cached.details.birthday) {
      const bMatch = String(cached.details.birthday).match(/^(\d{4})/);
      if (bMatch) birthYear = parseInt(bMatch[1], 10);
    }
    const getCreditYear = (c) => {
      if (c.credit_no_year) return "";
      if (
        c.earliest_air_date &&
        typeof c.earliest_air_date === "string" &&
        c.earliest_air_date.length >= 4
      ) {
        const yStr = c.earliest_air_date.substring(0, 4);
        const yNum = parseInt(yStr, 10);
        if (!birthYear || yNum >= birthYear) return yStr;
      }
      if (
        c.release_date &&
        typeof c.release_date === "string" &&
        c.release_date.length >= 4
      ) {
        return c.release_date.substring(0, 4);
      }
      if (
        c.air_date &&
        typeof c.air_date === "string" &&
        c.air_date.length >= 4
      ) {
        return c.air_date.substring(0, 4);
      }
      const text =
        (c.character || "") + " " + (c.title || "") + " " + (c.name || "");
      const ym = text.match(/\b(19\d{2}|20\d{2})\b/);
      if (ym) {
        const yNum = parseInt(ym[1], 10);
        if (!birthYear || yNum >= birthYear) return String(yNum);
      }
      if (
        c.first_air_date &&
        typeof c.first_air_date === "string" &&
        c.first_air_date.length >= 4
      ) {
        const yStr = c.first_air_date.substring(0, 4);
        const yNum = parseInt(yStr, 10);
        if (birthYear && yNum < birthYear) return "";
        return yStr;
      }
      if (c.year && String(c.year).length >= 4) {
        const yStr = String(c.year).substring(0, 4);
        const yNum = parseInt(yStr, 10);
        if (birthYear && yNum < birthYear) return "";
        return yStr;
      }
      return "";
    };
    const enriched = filtered.map((c) => {
      const type = c.media_type || (c.title ? "movie" : "tv");
      let charName = (c.character || "").trim();
      if (charName && charName.includes("/")) {
        const cParts = charName.split(/\s*\/\s*/);
        const seenChar = new Set();
        const uniqChar = [];
        for (const cp of cParts) {
          const cpTrim = cp.trim();
          const cpNorm = cpTrim.toLowerCase();
          if (cpTrim && !seenChar.has(cpNorm)) {
            seenChar.add(cpNorm);
            uniqChar.push(cpTrim);
          }
        }
        charName = uniqChar.join(" / ");
      }
      const yr = getCreditYear(c);
      let rolePart = "";
      const isActing =
        !this.currentPersonDept ||
        this.currentPersonDept.toLowerCase() === "acting";
      if (isActing) {
        if (type === "tv") {
          const epCount =
            typeof c.episode_count === "number" ? c.episode_count : null;
          if (epCount !== null && epCount !== undefined && epCount > 0) {
            const epLabel = epCount === 1 ? "1 episode" : epCount + " episodes";
            rolePart = epLabel + (charName ? " as " + charName : "");
          } else if (charName) {
            rolePart = "as " + charName;
          }
        } else {
          if (charName) rolePart = "as " + charName;
        }
      } else {
        const jobTitle = (c.job || this.currentPersonDept || "").trim();
        if (type === "tv") {
          const epCount =
            typeof c.episode_count === "number" ? c.episode_count : null;
          if (epCount !== null && epCount !== undefined && epCount > 0) {
            const epLabel = epCount === 1 ? "1 episode" : epCount + " episodes";
            rolePart = epLabel + (jobTitle ? " as " + jobTitle : "");
          } else if (jobTitle) {
            rolePart = jobTitle;
          }
        } else {
          if (jobTitle) rolePart = jobTitle;
        }
      }
      const yrDisplay = yr || "—";
      let roleStr = "";
      if (rolePart) {
        roleStr = yrDisplay + " - " + rolePart;
      } else if (yr) {
        roleStr = yr;
      } else {
        roleStr = "—";
      }
      return Object.assign({}, c, { actingYear: yr, personRole: roleStr });
    });
    const datedShowIds = new Set(
      enriched.filter((c) => c.actingYear && c.id).map((c) => String(c.id)),
    );
    const cleanEnriched = enriched.filter((c) => {
      if (!c.actingYear && c.id && datedShowIds.has(String(c.id))) return false;
      return true;
    });
    const sortOrder = this.personYearSort || "desc";
    const sorted = [...cleanEnriched].sort((a, b) => {
      const yA = a.actingYear || "";
      const yB = b.actingYear || "";
      if (!yA && !yB) return 0;
      if (!yA) return 1;
      if (!yB) return -1;
      return sortOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
    });
    this.personAllCredits = sorted;
    const pfBar = this.$g("person-catalog-filter-bar");
    if (pfBar) {
      pfBar.style.display = sorted.length > 30 ? "flex" : "none";
    }
    const pfCountryWrap = this.$g("pf-country-wrap");
    if (pfCountryWrap) {
      pfCountryWrap.style.display =
        this.getCountryOptions("person").length > 1 ? "inline-flex" : "none";
    }
    this.renderAllFilterTags("person");
    this.applyPersonFilters();
  },
  filterPersonKnownFor: function (list, sOrder = "desc") {
    const isActing =
      !this.currentPersonDept ||
      this.currentPersonDept.toLowerCase() === "acting";
    const checkCredit = (c, strict) => {
      const mType = c.media_type || (c.title ? "movie" : "tv");
      const gIds = c.genre_ids || (c.genres || []).map((g) => g.id || g);
      if (gIds.includes(10767) || gIds.includes(10763)) return false;
      if (!isActing) return (c.vote_count || 0) >= (strict ? 20 : 1);
      const charStr = String(c.character || "");
      if (
        /\b(?:self|himself|herself|archive|uncredited)\b/i.test(charStr) ||
        gIds.includes(99)
      )
        return false;
      if (mType === "tv") {
        const eps = Number(c.episode_count) || 0;
        return strict ? eps >= 5 : eps >= 2;
      }
      const ord = typeof c.order === "number" ? c.order : 99;
      const votes = Number(c.vote_count) || 0;
      return strict ? ord <= 8 && (votes >= 15 || ord <= 3) : ord <= 15;
    };
    let filtered = list.filter((c) => checkCredit(c, true));
    if (filtered.length === 0)
      filtered = list.filter((c) => checkCredit(c, false));
    if (filtered.length === 0) filtered = [...list];
    const getScore = (c) => {
      const mType = c.media_type || (c.title ? "movie" : "tv");
      const pop =
        Math.log10((c.vote_count || 0) + 10) * 10 +
        Math.log10((c.popularity || 0) + 1) * 5;
      if (mType === "tv") {
        const eps = Math.min(Number(c.episode_count) || 1, 120);
        return pop * (1 + Math.log2(eps + 1) * 0.45);
      }
      const ord = typeof c.order === "number" ? c.order : 10;
      return pop * (1 + 6 / (ord + 2));
    };
    return filtered.sort((a, b) => {
      const yA = a.actingYear || "";
      const yB = b.actingYear || "";
      if (!yA && !yB) return getScore(b) - getScore(a);
      if (!yA) return 1;
      if (!yB) return -1;
      const yCmp =
        sOrder === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
      if (yCmp !== 0) return yCmp;
      return getScore(b) - getScore(a);
    });
  },
  setPersonTypeFilter: function (type) {
    if (this.personTypeFilter === type) return;
    this.personTypeFilter = type;
    const pfbAll = this.$g("pfb-all");
    const pfbMov = this.$g("pfb-movie");
    const pfbTv = this.$g("pfb-tv");
    if (pfbAll) pfbAll.classList.toggle("active", type === "all");
    if (pfbMov) pfbMov.classList.toggle("active", type === "movie");
    if (pfbTv) pfbTv.classList.toggle("active", type === "tv");
    this.applyPersonFilters();
  },
  loadMorePersonFilmography: function () {
    const list = this.personFilteredCredits || this.personAllCredits;
    if (!list || this.personRenderedCount >= list.length) return;
    const grid = this.$g("person-filmography-grid");
    if (!grid) return;
    const nextBatch = list.slice(
      this.personRenderedCount,
      this.personRenderedCount + 30,
    );
    if (nextBatch.length === 0) return;
    const cardsHtml = nextBatch
      .map((c) => {
        const type = c.media_type || (c.title ? "movie" : "tv");
        return this.buildCard(c, type);
      })
      .join("");
    grid.insertAdjacentHTML("beforeend", cardsHtml);
    this.personRenderedCount += nextBatch.length;
    this.markImgsLoaded(grid.querySelectorAll("img"));
    this.bindPersonTvCardClicks();
  },
  bindPersonTvCardClicks: function () {
    const grid = this.$g("person-filmography-grid");
    if (!grid) return;
    const credits = this.personFilteredCredits || this.personAllCredits || [];
    const allCards = Array.from(grid.querySelectorAll(".poster-card"));
    allCards.forEach((card, idx) => {
      if (card.dataset.showType !== "tv" || card.dataset.peBound === "1")
        return;
      card.dataset.peBound = "1";
      const sid = card.dataset.showId;
      const idxCredit =
        credits[idx] && String(credits[idx].id) === String(sid)
          ? credits[idx]
          : null;
      const exactCredit =
        idxCredit || credits.find((c) => String(c.id) === String(sid)) || null;
      card.onclick = (e) => {
        if (e.target && e.target.closest(".bookmark-btn")) return;
        this.openPersonEpisodesModal(sid, exactCredit);
      };
    });
  },
  openPersonEpisodesModal: async function (tvId, credit = null) {
    const modal = this.$g("person-ep-modal");
    if (!modal || !tvId) return;
    const reqId = (this._peReqId = (this._peReqId || 0) + 1);
    const posterEl = this.$g("pe-poster");
    const titleEl = this.$g("pe-title");
    const subEl = this.$g("pe-sub");
    const seasonsRow = this.$g("pe-seasons-row");
    const seasonLabelEl = modal.querySelector(".pe-season-label");
    const seasonContainerEl = modal.querySelector(".pe-seasons-container");
    const epListEl = this.$g("pe-ep-list");
    const loaderEl = this.$g("pe-loader");
    if (seasonLabelEl) seasonLabelEl.style.display = "";
    if (seasonContainerEl) seasonContainerEl.style.display = "";
    const showName = (credit && (credit.name || credit.title)) || "Show";
    const posterPath = (credit && credit.poster_path) || "";
    if (posterEl) {
      if (posterPath) {
        posterEl.src = this.getImg(posterPath, "poster");
        posterEl.style.opacity = "1";
        posterEl.style.visibility = "visible";
        posterEl.style.display = "block";
        this.markImgsLoaded([posterEl]);
      } else {
        posterEl.removeAttribute("src");
        posterEl.style.display = "none";
      }
    }
    if (titleEl)
      titleEl.innerHTML =
        "<span>" +
        showName +
        '</span><span class="pe-title-arrow">&#8250;</span>';
    const epCnt =
      credit &&
      typeof credit.episode_count === "number" &&
      credit.episode_count > 0
        ? credit.episode_count === 1
          ? "1 episode"
          : credit.episode_count + " episodes"
        : "";
    const yrInit = credit && credit.actingYear ? credit.actingYear : "";
    if (subEl) subEl.textContent = [epCnt, yrInit].filter(Boolean).join(" • ");
    if (seasonsRow) seasonsRow.innerHTML = "";
    if (epListEl) epListEl.innerHTML = "";
    if (loaderEl) loaderEl.style.display = "flex";
    this._peState = {
      tvId: String(tvId),
      credit,
      roleText: (credit && (credit.character || credit.job)) || "",
      isMainCast: false,
      seasons: [],
      epMap: null,
      activeSeason: 1,
      showData: null,
    };
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    if (!window.history.state || window.history.state.modal !== "person_ep") {
      window.history.pushState(
        {
          ...(window.history.state || {}),
          modal: "person_ep",
          view: this.currentView,
        },
        "",
        window.location.href,
      );
    }
    try {
      const key = this.getTmdbMediaKey();
      const creditReq =
        credit && credit.credit_id
          ? this.api("/credit/" + credit.credit_id, {}, key).catch(() => null)
          : Promise.resolve(null);
      const [showData, credData, creditDetail] = await Promise.all([
        this.api("/tv/" + tvId, {}, key).catch(() => null),
        this.api("/tv/" + tvId + "/credits", {}, key).catch(() => null),
        creditReq,
      ]);
      if (reqId !== this._peReqId || !modal.classList.contains("active"))
        return;
      if (!showData || !showData.id) {
        if (loaderEl) loaderEl.style.display = "none";
        if (epListEl)
          epListEl.innerHTML =
            '<div class="pe-empty">Unable to load show details.</div>';
        return;
      }
      if (posterEl && showData.poster_path) {
        posterEl.src = this.getImg(showData.poster_path, "poster");
        posterEl.style.opacity = "1";
        posterEl.style.visibility = "visible";
        posterEl.style.display = "block";
        this.markImgsLoaded([posterEl]);
      }
      if (titleEl)
        titleEl.innerHTML =
          "<span>" +
          (showData.name || showData.title || showName) +
          '</span><span class="pe-title-arrow">&#8250;</span>';
      const firstYr = (showData.first_air_date || "").substring(0, 4);
      const lastYr = (showData.last_air_date || "").substring(0, 4);
      const yrRange = firstYr
        ? lastYr && lastYr !== firstYr
          ? firstYr + "–" + lastYr
          : firstYr
        : yrInit;
      const totalEpTxt =
        epCnt ||
        (showData.number_of_episodes
          ? showData.number_of_episodes + " episodes"
          : "");
      if (subEl)
        subEl.textContent = [totalEpTxt, yrRange].filter(Boolean).join(" • ");
      const pid = String(this.currentPersonId || "");
      const inMainCast = Boolean(
        (credData?.cast || []).some((m) => String(m.id) === pid),
      );
      const highEpCount = Boolean(
        credit &&
        typeof credit.episode_count === "number" &&
        showData.number_of_episodes &&
        credit.episode_count >=
          Math.min(
            12,
            Math.max(4, Math.round(showData.number_of_episodes * 0.35)),
          ),
      );
      const isMainCast = inMainCast || highEpCount;
      let allAiredSeasons = (showData.seasons || []).filter(
        (s) => s && s.season_number > 0 && this.isSeasonAired(s),
      );
      if (allAiredSeasons.length === 0)
        allAiredSeasons = (showData.seasons || []).filter(
          (s) => s && s.season_number > 0,
        );
      if (
        allAiredSeasons.length === 0 &&
        showData.seasons &&
        showData.seasons.length > 0
      )
        allAiredSeasons = showData.seasons;
      const epMap = {};
      const creditMediaEps =
        creditDetail &&
        creditDetail.media &&
        Array.isArray(creditDetail.media.episodes)
          ? creditDetail.media.episodes
          : [];
      if (creditMediaEps.length > 0) {
        const hasPosSeason = creditMediaEps.some(
          (ep) => ep && Number(ep.season_number) > 0,
        );
        const filteredEps = creditMediaEps.filter(
          (ep) =>
            ep &&
            (hasPosSeason
              ? Number(ep.season_number) > 0
              : Number(ep.season_number) >= 0),
        );
        filteredEps.forEach((ep) => {
          const sNum = Number(ep.season_number);
          if (!epMap[sNum]) epMap[sNum] = [];
          if (
            !epMap[sNum].some(
              (x) => Number(x.episode_number) === Number(ep.episode_number),
            )
          )
            epMap[sNum].push(ep);
        });
        Object.keys(epMap).forEach((k) => {
          epMap[k].sort(
            (a, b) => Number(a.episode_number) - Number(b.episode_number),
          );
        });
      }
      const creditMediaSeasons =
        creditDetail &&
        creditDetail.media &&
        Array.isArray(creditDetail.media.seasons)
          ? creditDetail.media.seasons
          : [];
      const hasPosCreditSeason = creditMediaSeasons.some(
        (s) => s && Number(s.season_number) > 0,
      );
      const creditSeasonNums = Array.from(
        new Set(
          creditMediaSeasons
            .filter(
              (s) =>
                s &&
                (hasPosCreditSeason
                  ? Number(s.season_number) > 0
                  : Number(s.season_number) >= 0),
            )
            .map((s) => Number(s.season_number)),
        ),
      ).sort((a, b) => a - b);
      let tier2Seasons = null;
      const missingCreditSeasons = creditSeasonNums.filter((n) => !epMap[n]);
      if (missingCreditSeasons.length > 0) {
        if (isMainCast && Object.keys(epMap).length === 0) {
          tier2Seasons = creditSeasonNums.map(
            (n) =>
              allAiredSeasons.find((s) => Number(s.season_number) === n) || {
                season_number: n,
              },
          );
        } else {
          for (let i = 0; i < missingCreditSeasons.length; i += 5) {
            const batch = missingCreditSeasons.slice(i, i + 5);
            const batchRes = await Promise.all(
              batch.map((n) =>
                this.api("/tv/" + tvId + "/season/" + n, {}, key).catch(
                  () => null,
                ),
              ),
            );
            if (reqId !== this._peReqId || !modal.classList.contains("active"))
              return;
            batch.forEach((n, bi) => {
              const sData = batchRes[bi];
              const rawEps =
                sData && Array.isArray(sData.episodes) ? sData.episodes : [];
              const matched = pid
                ? rawEps.filter(
                    (ep) =>
                      (ep.guest_stars || []).some(
                        (g) => String(g.id) === pid,
                      ) || (ep.crew || []).some((cr) => String(cr.id) === pid),
                  )
                : [];
              if (matched.length > 0) epMap[n] = matched;
              else if (rawEps.length > 0) epMap[n] = rawEps;
            });
          }
        }
      }
      if (
        Object.keys(epMap).length === 0 &&
        !tier2Seasons &&
        !isMainCast &&
        pid &&
        allAiredSeasons.length > 0
      ) {
        for (let i = 0; i < allAiredSeasons.length; i += 5) {
          const batch = allAiredSeasons.slice(i, i + 5);
          const batchRes = await Promise.all(
            batch.map((s) =>
              this.api(
                "/tv/" + tvId + "/season/" + s.season_number,
                {},
                key,
              ).catch(() => null),
            ),
          );
          if (reqId !== this._peReqId || !modal.classList.contains("active"))
            return;
          batch.forEach((s, bi) => {
            const sData = batchRes[bi];
            const rawEps =
              sData && Array.isArray(sData.episodes) ? sData.episodes : [];
            const matched = rawEps.filter(
              (ep) =>
                (ep.guest_stars || []).some((g) => String(g.id) === pid) ||
                (ep.crew || []).some((cr) => String(cr.id) === pid),
            );
            if (matched.length > 0) epMap[s.season_number] = matched;
          });
        }
      }
      let resolvedSeasons = [];
      const epMapKeys = Object.keys(epMap)
        .map(Number)
        .sort((a, b) => a - b);
      if (epMapKeys.length > 0) {
        resolvedSeasons = epMapKeys.map(
          (n) =>
            allAiredSeasons.find((s) => Number(s.season_number) === n) || {
              season_number: n,
            },
        );
        this._peState.epMap = epMap;
      } else if (tier2Seasons && tier2Seasons.length > 0) {
        resolvedSeasons = tier2Seasons;
      } else if (isMainCast) {
        resolvedSeasons = allAiredSeasons;
      }
      this._peState.showData = showData;
      this._peState.isMainCast = isMainCast;
      this._peState.seasons = resolvedSeasons;
      if (resolvedSeasons.length === 0) {
        if (seasonLabelEl) seasonLabelEl.style.display = "none";
        if (seasonContainerEl) seasonContainerEl.style.display = "none";
        if (loaderEl) loaderEl.style.display = "none";
        if (epListEl)
          epListEl.innerHTML =
            '<div class="pe-empty">No credited episodes found for this title.</div>';
        return;
      }
      const initSeason = resolvedSeasons[0].season_number;
      this._peState.activeSeason = initSeason;
      if (seasonsRow) {
        seasonsRow.innerHTML = resolvedSeasons
          .map(
            (s) =>
              '<button type="button" class="pe-season-btn' +
              (s.season_number === initSeason ? " active" : "") +
              '" data-s="' +
              s.season_number +
              '" onclick="app.loadPersonModalSeason(' +
              s.season_number +
              ')">' +
              s.season_number +
              "</button>",
          )
          .join("");
        seasonsRow.scrollLeft = 0;
        this.setupScrollRowArrows();
        this.checkScrollArrow(seasonsRow);
      }
      await this.loadPersonModalSeason(initSeason, reqId);
    } catch (e) {
      if (reqId === this._peReqId) {
        if (loaderEl) loaderEl.style.display = "none";
        if (epListEl)
          epListEl.innerHTML =
            '<div class="pe-empty">Error loading episodes.</div>';
      }
    }
  },
  loadPersonModalSeason: async function (seasonNum, parentReqId = null) {
    const st = this._peState;
    if (!st || !st.tvId) return;
    const reqId = parentReqId || (this._peReqId = (this._peReqId || 0) + 1);
    st.activeSeason = seasonNum;
    const seasonsRow = this.$g("pe-seasons-row");
    if (seasonsRow) {
      seasonsRow
        .querySelectorAll(".pe-season-btn")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            Number(b.dataset.s) === Number(seasonNum),
          ),
        );
    }
    const loaderEl = this.$g("pe-loader");
    const epListEl = this.$g("pe-ep-list");
    const pid = String(this.currentPersonId || "");
    let eps = null;
    if (st.epMap && Array.isArray(st.epMap[seasonNum])) {
      eps = st.epMap[seasonNum];
    } else {
      if (loaderEl) loaderEl.style.display = "flex";
      try {
        if (st.isMainCast) {
          const sData = await this.fetchSeasonEpisodes(st.tvId, seasonNum);
          if (reqId !== this._peReqId) return;
          eps = sData && Array.isArray(sData.episodes) ? sData.episodes : [];
        } else {
          const key = this.getTmdbMediaKey();
          const sData = await this.api(
            "/tv/" + st.tvId + "/season/" + seasonNum,
            {},
            key,
          );
          if (reqId !== this._peReqId) return;
          const rawEps =
            sData && Array.isArray(sData.episodes) ? sData.episodes : [];
          eps = pid
            ? rawEps.filter(
                (ep) =>
                  (ep.guest_stars || []).some((g) => String(g.id) === pid) ||
                  (ep.crew || []).some((cr) => String(cr.id) === pid),
              )
            : rawEps;
        }
      } catch (e) {
        if (reqId === this._peReqId) {
          if (loaderEl) loaderEl.style.display = "none";
          if (epListEl)
            epListEl.innerHTML =
              '<div class="pe-empty">Error loading episodes.</div>';
        }
        return;
      }
    }
    if (loaderEl) loaderEl.style.display = "none";
    if (!epListEl) return;
    if (!eps || eps.length === 0) {
      epListEl.innerHTML =
        '<div class="pe-empty">No credited appearances in Season ' +
        seasonNum +
        ".</div>";
      return;
    }
    const defaultRole = st.roleText || "";
    epListEl.innerHTML = eps
      .map((ep) => {
        const epYr = (ep.air_date || "").substring(0, 4);
        const yrStr = epYr ? " (" + epYr + ")" : "";
        let roleStr = defaultRole;
        if (!st.isMainCast && pid) {
          const gHit = (ep.guest_stars || []).find((g) => String(g.id) === pid);
          const cHit = (ep.crew || []).find((cr) => String(cr.id) === pid);
          if (gHit && gHit.character) roleStr = gHit.character;
          else if (cHit && cHit.job) roleStr = cHit.job;
        }
        const epName = ep.name || "Episode " + ep.episode_number;
        return (
          '<div class="pe-ep-row clickable" onclick="app.goToEpisodeFromPersonModal(\'' +
          st.tvId +
          "'," +
          seasonNum +
          "," +
          ep.episode_number +
          ')"><div class="pe-ep-title">S' +
          seasonNum +
          ".E" +
          ep.episode_number +
          " &bull; " +
          epName +
          yrStr +
          "</div>" +
          (roleStr ? '<div class="pe-ep-role">' + roleStr + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
    epListEl.parentElement.scrollTop = 0;
  },
  closePersonEpisodesModal: function (e = null, fromPopState = false) {
    if (
      e &&
      e.target &&
      e.target.id !== "person-ep-modal" &&
      !e.target.closest(".pe-close-btn")
    )
      return;
    const modal = this.$g("person-ep-modal");
    if (!modal || !modal.classList.contains("active")) return;
    if (
      !fromPopState &&
      window.history.state &&
      window.history.state.modal === "person_ep"
    ) {
      window.history.back();
      return;
    }
    modal.classList.remove("active");
    this.syncModalOpen();
  },
  openShowFromPersonModal: function () {
    const tvId = this._peState && this._peState.tvId;
    const modal = this.$g("person-ep-modal");
    const hadModalState = Boolean(
      window.history.state && window.history.state.modal === "person_ep",
    );
    if (modal) modal.classList.remove("active");
    this.syncModalOpen();
    if (tvId) this.openShowinfo(tvId, "tv", true, hadModalState);
  },
  goToEpisodeFromPersonModal: function (tvId, seasonNum, epNum) {
    const modal = this.$g("person-ep-modal");
    const hadModalState = Boolean(
      window.history.state && window.history.state.modal === "person_ep",
    );
    if (modal) modal.classList.remove("active");
    this.syncModalOpen();
    this._skipEpHistoryPush = true;
    this.pendingHighlightEpisode = {
      showId: String(tvId),
      season: Number(seasonNum),
      episode: Number(epNum),
    };
    this.showSeasons[tvId] = Number(seasonNum);
    this.$storeSet("showSeasons", this.showSeasons);
    if (this.showEpPages) delete this.showEpPages[`${tvId}_${seasonNum}`];
    this.openShowinfo(tvId, "tv", true, hadModalState, true, true);
  },
  openEpisodeCastModal: async function (
    tvId,
    seasonNum,
    epNum,
    triggerEl = null,
  ) {
    const modal = this.$g("ep-cast-modal");
    if (!modal || !tvId) return;
    const reqId = (this._epcReqId = (this._epcReqId || 0) + 1);
    const titleEl = this.$g("epc-title");
    const listEl = this.$g("epc-list");
    const loaderEl = this.$g("epc-loader");
    const cardTitle =
      triggerEl && triggerEl.closest
        ? triggerEl.closest(".ep-card")?.querySelector(".ep-title")
            ?.textContent || ""
        : "";
    if (titleEl)
      titleEl.textContent = cardTitle || "S" + seasonNum + " E" + epNum;
    if (listEl) listEl.innerHTML = "";
    if (loaderEl) loaderEl.style.display = "flex";
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    if (!window.history.state || window.history.state.modal !== "ep_cast") {
      window.history.pushState(
        {
          ...(window.history.state || {}),
          modal: "ep_cast",
          view: this.currentView,
        },
        "",
        window.location.href,
      );
    }
    try {
      const key = this.getTmdbMediaKey();
      const tmdbId =
        this.currentShow &&
        String(this.currentShow.id) === String(tvId) &&
        this.currentShow.tmdb_id
          ? this.currentShow.tmdb_id
          : tvId;
      if (String(tmdbId).startsWith("ani_")) {
        if (loaderEl) loaderEl.style.display = "none";
        if (listEl)
          listEl.innerHTML =
            '<div class="pe-empty">No episode cast credits available.</div>';
        return;
      }
      const data = await this.api(
        "/tv/" +
          tmdbId +
          "/season/" +
          seasonNum +
          "/episode/" +
          epNum +
          "/credits",
        {},
        key,
      ).catch(() => null);
      if (reqId !== this._epcReqId || !modal.classList.contains("active"))
        return;
      const cast = data && Array.isArray(data.cast) ? data.cast : [];
      const guests =
        data && Array.isArray(data.guest_stars) ? data.guest_stars : [];
      const seen = new Set();
      const merged = [];
      cast.concat(guests).forEach((p) => {
        if (!p || !p.id || !p.name) return;
        const pid = String(p.id);
        if (seen.has(pid)) return;
        seen.add(pid);
        merged.push(p);
      });
      if (loaderEl) loaderEl.style.display = "none";
      if (!listEl) return;
      if (merged.length === 0) {
        listEl.innerHTML =
          '<div class="pe-empty">No cast credits available for this episode.</div>';
        return;
      }
      listEl.innerHTML = merged
        .map((p) => {
          const roleHtml = p.character
            ? '<div class="pe-ep-role">' + p.character + "</div>"
            : "";
          return (
            '<div class="pe-ep-row clickable" onclick="app.goToPersonFromEpCastModal(' +
            p.id +
            ')"><div class="pe-ep-title">' +
            p.name +
            "</div>" +
            roleHtml +
            "</div>"
          );
        })
        .join("");
      if (listEl.parentElement) listEl.parentElement.scrollTop = 0;
    } catch (e) {
      if (reqId === this._epcReqId) {
        if (loaderEl) loaderEl.style.display = "none";
        if (listEl)
          listEl.innerHTML =
            '<div class="pe-empty">Error loading episode cast.</div>';
      }
    }
  },
  closeEpisodeCastModal: function (e = null, fromPopState = false) {
    if (
      e &&
      e.target &&
      e.target.id !== "ep-cast-modal" &&
      !e.target.closest(".pe-close-btn")
    )
      return;
    const modal = this.$g("ep-cast-modal");
    if (!modal || !modal.classList.contains("active")) return;
    if (
      !fromPopState &&
      window.history.state &&
      window.history.state.modal === "ep_cast"
    ) {
      window.history.back();
      return;
    }
    modal.classList.remove("active");
    this.syncModalOpen();
  },
  goToPersonFromEpCastModal: function (personId) {
    const modal = this.$g("ep-cast-modal");
    const hadModalState = Boolean(
      window.history.state && window.history.state.modal === "ep_cast",
    );
    if (modal) modal.classList.remove("active");
    this.syncModalOpen();
    if (personId) this.openPerson(personId, true, hadModalState);
  },
  setPersonYearSort: function (order) {
    if (this.personYearSort === order) return;
    this.personYearSort = order;
    const descBtn = this.$g("person-year-sort-desc-btn");
    const ascBtn = this.$g("person-year-sort-asc-btn");
    if (descBtn) descBtn.classList.toggle("active", order === "desc");
    if (ascBtn) ascBtn.classList.toggle("active", order === "asc");
    if (this.personAllCredits) {
      this.applyPersonFilters();
    } else if (this.personCredits) {
      this.renderPersonFilmography(this.personCredits);
    }
  },
  resolveCompanyCategory: function (name, isAnime = false) {
    if (!name) return "Company";
    if (isAnime || /\b(studios?|animation|anime)\b/i.test(name))
      return "Studio";
    return "Company";
  },
  resolveNetworkCategory: function (name) {
    if (!name) return "Network";
    if (
      /\b(netflix|apple\s*tv\+?|disney\+?|prime\s*video|amazon|hulu|peacock|paramount\+?|max|hbo\s*max|crunchyroll|youtube|tubi|pluto)\b/i.test(
        name,
      )
    ) {
      return "Platform";
    }
    return "Network";
  },
  openSource: async function (
    sourceId,
    sourceType = "company",
    sourceName = "",
    pushState = true,
    replaceState = false,
  ) {
    if (!sourceId) return;
    const sGrid = this.$g("source-titles-grid");
    const sContent = this.$g("source-content-wrap");
    const sLoader = this.$g("source-unified-loader");
    if (
      !pushState &&
      String(this.currentSourceId) === String(sourceId) &&
      sGrid &&
      sGrid.children &&
      sGrid.children.length > 0
    ) {
      this.currentView = "source";
      this.setActiveView("source", null);
      this.updateBackBtn("source");
      if (sLoader) sLoader.style.display = "none";
      if (sContent) sContent.style.display = "block";
      if (this.sourceScrollPos > 0) {
        this.restoreScroll(this.sourceScrollPos);
        this.sourceScrollPos = 0;
      }
      return;
    }
    if (
      this.currentView === "people" ||
      this.currentView === "companies" ||
      (this.currentView === "explore" &&
        this.$g("explore-catalog")?.style.display !== "none")
    ) {
      if (!this.exploreScrollPos) this.exploreScrollPos = {};
      this.exploreScrollPos[this.exploreType || "company"] = this.getScrollY();
      this.returnFromShowinfoToExplore = true;
    } else if (
      this.currentView === "showinfo" ||
      this.currentView === "movies" ||
      this.currentView === "shows" ||
      this.currentView === "series"
    ) {
      this.resetExploreRandom();
    }
    this.currentSourceId = sourceId;
    this.currentSourceType = sourceType || "company";
    this.sourceYearSort = "desc";
    this.currentView = "source";
    this.setActiveView("source", null);
    this.updateBackBtn("source");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const unifiedLoader = this.$g("source-unified-loader");
    const contentWrap = this.$g("source-content-wrap");
    if (unifiedLoader) unifiedLoader.style.display = "flex";
    if (contentWrap) contentWrap.style.display = "none";
    const catHeading = this.$g("source-cat-heading");
    const nameEl = this.$g("source-name");
    const locRow = this.$g("source-location-row");
    const locText = this.$g("source-location-text");
    const grid = this.$g("source-titles-grid");
    const countHeading = this.$g("source-titles-heading");
    if (catHeading)
      catHeading.textContent = sourceType === "network" ? "Network" : "Company";
    if (nameEl) nameEl.textContent = sourceName || "";
    if (locRow) locRow.style.display = "none";
    if (locText) locText.textContent = "";
    if (countHeading) countHeading.textContent = "Titles";
    if (grid) grid.innerHTML = "";
    const descBtn = this.$g("source-year-sort-desc-btn");
    const ascBtn = this.$g("source-year-sort-asc-btn");
    if (descBtn) descBtn.classList.add("active");
    if (ascBtn) ascBtn.classList.remove("active");
    this.sourceYearSort = "desc";
    this.sourceTypeFilter = "all";
    const srcfbAll = this.$g("srcfb-all");
    const srcfbMov = this.$g("srcfb-movie");
    const srcfbTv = this.$g("srcfb-tv");
    if (srcfbAll) srcfbAll.classList.add("active");
    if (srcfbMov) srcfbMov.classList.remove("active");
    if (srcfbTv) srcfbTv.classList.remove("active");
    this.sourceFilterExpanded = false;
    if (this.sourceMulti) {
      this.sourceFilterKeys.forEach((k) => {
        this.sourceMulti[k] = [];
      });
    }
    const sfWrap = this.$g("source-catalog-filter-bar");
    if (sfWrap) {
      sfWrap.style.display = "none";
      sfWrap.classList.add("minimized");
    }
    const sfType = this.$g("sf-type");
    const sfTypeInput = this.$g("sf-type-input");
    const sfTypeClear = this.$g("sf-type-clear");
    if (sfType) sfType.value = "";
    if (sfTypeInput) sfTypeInput.value = "";
    if (sfTypeClear) sfTypeClear.style.display = "none";
    this.updateTypeInputWidth("source");
    this.renderAllFilterTags("source");
    this.updateSourceFilterToggleUI();
    this.sourceSearchOpen = false;
    this.sourceSearchQuery = "";
    const sSearchInp = this.$g("source-search-input");
    if (sSearchInp) sSearchInp.value = "";
    this.updateCatalogSearchUI("source");
    const cacheKey = `source_${sourceType}_${sourceId}`;
    if (!this.sourceCache) this.sourceCache = {};
    let cached = this.sourceCache[cacheKey];
    if (!cached) {
      const key = this.getTmdbAnimeKey();
      try {
        if (sourceType === "network") {
          const [details, tvRes] = await Promise.all([
            this.api(`/network/${sourceId}`, {}, key).catch(() => null),
            this.api(
              "/discover/tv",
              { with_networks: sourceId, sort_by: "popularity.desc", page: 1 },
              key,
            ).catch(() => null),
          ]);
          const totalResults = tvRes?.total_results || 0;
          const totalPages = tvRes?.total_pages || 1;
          this.sourceTvPage = 1;
          this.sourceTvTotalPages = totalPages;
          this.sourceTotalResults = totalResults;
          let rawTv =
            tvRes && Array.isArray(tvRes.results)
              ? tvRes.results.map((i) =>
                  Object.assign({}, i, { media_type: "tv" }),
                )
              : [];
          if (totalPages > 1 && totalPages <= 5) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
              pagePromises.push(
                this.api(
                  "/discover/tv",
                  {
                    with_networks: sourceId,
                    sort_by: "popularity.desc",
                    page: p,
                  },
                  key,
                ).catch(() => null),
              );
            }
            this.sourceTvPage = totalPages;
            const moreRes = await Promise.all(pagePromises);
            moreRes.forEach((r) => {
              if (r && Array.isArray(r.results)) {
                rawTv.push(
                  ...r.results.map((i) =>
                    Object.assign({}, i, { media_type: "tv" }),
                  ),
                );
              }
            });
          } else if (totalPages > 5) {
            const p2 = await this.api(
              "/discover/tv",
              { with_networks: sourceId, sort_by: "popularity.desc", page: 2 },
              key,
            ).catch(() => null);
            if (p2 && Array.isArray(p2.results)) {
              this.sourceTvPage = 2;
              rawTv.push(
                ...p2.results.map((i) =>
                  Object.assign({}, i, { media_type: "tv" }),
                ),
              );
            }
          }
          const seen = new Set();
          const validTitles = [];
          for (const item of rawTv) {
            if (!item || !item.id || seen.has(String(item.id))) continue;
            seen.add(String(item.id));
            if (this.isBlocked && this.isBlocked(item, "tv")) continue;
            validTitles.push(item);
          }
          cached = {
            details,
            titles: validTitles,
            totalResults,
            tvTotalResults: totalResults,
            movieTotalResults: 0,
            tvPage: this.sourceTvPage,
            tvTotalPages: totalPages,
          };
        } else {
          const [details, movRes, tvRes] = await Promise.all([
            this.api(`/company/${sourceId}`, {}, key).catch(() => null),
            this.api(
              "/discover/movie",
              { with_companies: sourceId, sort_by: "popularity.desc", page: 1 },
              key,
            ).catch(() => null),
            this.api(
              "/discover/tv",
              { with_companies: sourceId, sort_by: "popularity.desc", page: 1 },
              key,
            ).catch(() => null),
          ]);
          const movTotalPages = movRes?.total_pages || 1;
          const tvTotalPages = tvRes?.total_pages || 1;
          const movTotalResults = movRes?.total_results || 0;
          const tvTotalResults = tvRes?.total_results || 0;
          const totalResults = movTotalResults + tvTotalResults;
          this.sourceMoviePage = 1;
          this.sourceTvPage = 1;
          this.sourceMovieTotalPages = movTotalPages;
          this.sourceTvTotalPages = tvTotalPages;
          this.sourceTotalResults = totalResults;
          let rawMov =
            movRes && Array.isArray(movRes.results)
              ? movRes.results.map((i) =>
                  Object.assign({}, i, { media_type: "movie" }),
                )
              : [];
          let rawTv =
            tvRes && Array.isArray(tvRes.results)
              ? tvRes.results.map((i) =>
                  Object.assign({}, i, { media_type: "tv" }),
                )
              : [];
          const maxPages = Math.max(movTotalPages, tvTotalPages);
          if (maxPages > 1 && maxPages <= 5) {
            const extraReqs = [];
            for (let p = 2; p <= movTotalPages; p++) {
              extraReqs.push(
                this.api(
                  "/discover/movie",
                  {
                    with_companies: sourceId,
                    sort_by: "popularity.desc",
                    page: p,
                  },
                  key,
                )
                  .then((r) => ({ type: "movie", res: r }))
                  .catch(() => null),
              );
            }
            for (let p = 2; p <= tvTotalPages; p++) {
              extraReqs.push(
                this.api(
                  "/discover/tv",
                  {
                    with_companies: sourceId,
                    sort_by: "popularity.desc",
                    page: p,
                  },
                  key,
                )
                  .then((r) => ({ type: "tv", res: r }))
                  .catch(() => null),
              );
            }
            this.sourceMoviePage = movTotalPages;
            this.sourceTvPage = tvTotalPages;
            const moreRes = await Promise.all(extraReqs);
            moreRes.forEach((item) => {
              if (item && item.res && Array.isArray(item.res.results)) {
                if (item.type === "movie")
                  rawMov.push(
                    ...item.res.results.map((i) =>
                      Object.assign({}, i, { media_type: "movie" }),
                    ),
                  );
                else
                  rawTv.push(
                    ...item.res.results.map((i) =>
                      Object.assign({}, i, { media_type: "tv" }),
                    ),
                  );
              }
            });
          } else if (maxPages > 5) {
            const p2Reqs = [];
            if (movTotalPages > 1) {
              p2Reqs.push(
                this.api(
                  "/discover/movie",
                  {
                    with_companies: sourceId,
                    sort_by: "popularity.desc",
                    page: 2,
                  },
                  key,
                )
                  .then((r) => ({ type: "movie", res: r }))
                  .catch(() => null),
              );
              this.sourceMoviePage = 2;
            }
            if (tvTotalPages > 1) {
              p2Reqs.push(
                this.api(
                  "/discover/tv",
                  {
                    with_companies: sourceId,
                    sort_by: "popularity.desc",
                    page: 2,
                  },
                  key,
                )
                  .then((r) => ({ type: "tv", res: r }))
                  .catch(() => null),
              );
              this.sourceTvPage = 2;
            }
            const moreRes = await Promise.all(p2Reqs);
            moreRes.forEach((item) => {
              if (item && item.res && Array.isArray(item.res.results)) {
                if (item.type === "movie")
                  rawMov.push(
                    ...item.res.results.map((i) =>
                      Object.assign({}, i, { media_type: "movie" }),
                    ),
                  );
                else
                  rawTv.push(
                    ...item.res.results.map((i) =>
                      Object.assign({}, i, { media_type: "tv" }),
                    ),
                  );
              }
            });
          }
          const merged = [];
          const maxLen = Math.max(rawMov.length, rawTv.length);
          for (let i = 0; i < maxLen; i++) {
            if (rawMov[i]) merged.push(rawMov[i]);
            if (rawTv[i]) merged.push(rawTv[i]);
          }
          const seen = new Set();
          const validTitles = [];
          for (const item of merged) {
            if (!item || !item.id || seen.has(String(item.id))) continue;
            seen.add(String(item.id));
            const type = item.media_type || (item.title ? "movie" : "tv");
            if (this.isBlocked && this.isBlocked(item, type)) continue;
            validTitles.push(item);
          }
          cached = {
            details,
            titles: validTitles,
            totalResults,
            movieTotalResults: movTotalResults,
            tvTotalResults: tvTotalResults,
            moviePage: this.sourceMoviePage,
            tvPage: this.sourceTvPage,
            movieTotalPages: movTotalPages,
            tvTotalPages: tvTotalPages,
          };
        }
        if (cached.details) this.sourceCache[cacheKey] = cached;
      } catch (e) {
        console.error(e);
      }
    }
    if (
      this.currentView !== "source" ||
      String(this.currentSourceId) !== String(sourceId)
    )
      return;
    if (!cached || !cached.details) {
      if (unifiedLoader) unifiedLoader.style.display = "none";
      if (contentWrap) contentWrap.style.display = "block";
      if (grid)
        grid.innerHTML =
          '<div class="msg-box">Failed to load source details.</div>';
      return;
    }
    if (cached) {
      this.sourceTotalResults =
        cached.totalResults || (cached.titles ? cached.titles.length : 0);
      this.sourceMovieTotalResults =
        cached.movieTotalResults !== undefined ? cached.movieTotalResults : 0;
      this.sourceTvTotalResults =
        cached.tvTotalResults !== undefined ? cached.tvTotalResults : 0;
      this.sourceMoviePage = cached.moviePage || 1;
      this.sourceTvPage = cached.tvPage || 1;
      this.sourceMovieTotalPages = cached.movieTotalPages || 1;
      this.sourceTvTotalPages = cached.tvTotalPages || 1;
    }
    const sDetails = cached.details;
    const sTitles = cached.titles || [];
    const finalName = sDetails?.name || sourceName || "Source";
    document.title = finalName;
    this.syncHistoryUrl(
      { view: "source", id: sourceId, type: sourceType },
      finalName,
      `?view=source&type=${sourceType}&id=${sourceId}`,
      pushState,
      replaceState,
    );
    let resolvedCat = "Company";
    if (sourceType === "network") {
      resolvedCat = this.resolveNetworkCategory(finalName);
    } else {
      const isAnimeSource = sTitles.some((t) => this.isAnimeItem(t));
      resolvedCat = this.resolveCompanyCategory(finalName, isAnimeSource);
    }

    const preloadImg = (src) =>
      new Promise((resolve) => {
        if (!src) return resolve(false);
        const img = new Image();
        let done = false;
        const finish = (ok) => {
          if (!done) {
            done = true;
            resolve(ok);
          }
        };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = src;
        setTimeout(() => finish(false), 450);
      });

    this.sourceTitles = sTitles;
    this.renderSourceCatalog(this.sourceTitles);

    const initialImgs = grid
      ? Array.from(grid.querySelectorAll("img")).slice(0, 4)
      : [];
    const cardImgPromises = initialImgs.map((img) => preloadImg(img.src));
    await Promise.all(cardImgPromises);

    if (
      this.currentView !== "source" ||
      String(this.currentSourceId) !== String(sourceId)
    )
      return;

    if (catHeading) catHeading.textContent = resolvedCat;
    if (nameEl) nameEl.textContent = finalName;
    const logoWrap = this.$g("source-logo-wrap");
    const logoImg = this.$g("source-logo-img");
    if (logoWrap && logoImg) {
      logoWrap.style.background = "";
      logoImg.classList.remove("loaded");
      if (sDetails?.logo_path) {
        logoImg.src = this.getImg(sDetails.logo_path, "poster");
        logoWrap.style.display = "flex";
        if (logoImg.complete && logoImg.naturalWidth > 0)
          this.applyCompanyLogoBg(logoImg);
      } else {
        logoWrap.style.display = "none";
        logoImg.removeAttribute("src");
      }
    }

    const locParts = [];
    if (sDetails?.headquarters) locParts.push(sDetails.headquarters.trim());
    if (sDetails?.origin_country) {
      const cCode = sDetails.origin_country.trim();
      const cName =
        this.countryOverrides[cCode] || this.countryMap[cCode] || cCode;
      if (
        !sDetails.headquarters ||
        !sDetails.headquarters.toLowerCase().includes(cName.toLowerCase())
      ) {
        locParts.push(cName);
      }
    }
    if (locParts.length > 0 && locRow && locText) {
      locText.textContent = locParts.join(", ");
      locRow.style.display = "inline-flex";
    } else if (locRow) {
      locRow.style.display = "none";
    }

    if (grid) this.markImgsLoaded(grid.querySelectorAll("img"));
    if (typeof this.renderStaticIcons === "function") this.renderStaticIcons();
    if (unifiedLoader) unifiedLoader.style.display = "none";
    if (contentWrap) contentWrap.style.display = "block";
    if (!pushState && this.sourceScrollPos > 0) {
      this.restoreScroll(this.sourceScrollPos);
      this.sourceScrollPos = 0;
    }
  },
  renderSourceCatalog: function (titles) {
    const grid = this.$g("source-titles-grid");
    const countHeading = this.$g("source-titles-heading");
    const total = this.sourceTotalResults || (titles ? titles.length : 0);
    if (!titles || titles.length === 0) {
      if (countHeading) countHeading.textContent = "0 Titles";
      if (grid) grid.innerHTML = '<div class="msg-box">No titles found.</div>';
      return;
    }
    const hasMovies =
      this.currentSourceType !== "network" &&
      (this.sourceMovieTotalResults > 0 ||
        (titles &&
          titles.some(
            (t) => (t.media_type || (t.title ? "movie" : "tv")) === "movie",
          )));
    const hasShows =
      this.sourceTvTotalResults > 0 ||
      (titles &&
        titles.some(
          (t) => (t.media_type || (t.title ? "movie" : "tv")) === "tv",
        ));
    const srcFilterBar = this.$g("source-filter-bar");
    if (srcFilterBar) {
      srcFilterBar.style.display =
        hasMovies && hasShows ? "inline-flex" : "none";
    }
    const sortOrder = this.sourceYearSort || "desc";
    const curType = this.$g("sf-type")?.value;
    const sorted =
      curType && curType !== "popular" && curType !== ""
        ? [...titles]
        : [...titles].sort((a, b) => {
            const yA = this.getItemYear(a) || "";
            const yB = this.getItemYear(b) || "";
            if (!yA && !yB) return 0;
            if (!yA) return 1;
            if (!yB) return -1;
            return sortOrder === "asc"
              ? yA.localeCompare(yB)
              : yB.localeCompare(yA);
          });
    this.sourceAllTitles = sorted;
    const sfBar = this.$g("source-catalog-filter-bar");
    if (sfBar) {
      sfBar.style.display = total > 30 ? "flex" : "none";
    }
    const sfCountryWrap = this.$g("sf-country-wrap");
    if (sfCountryWrap) {
      sfCountryWrap.style.display =
        this.getCountryOptions("source").length > 1 ? "inline-flex" : "none";
    }
    this.renderAllFilterTags("source");
    this.applySourceFilters();
  },
  setSourceTypeFilter: function (type) {
    if (this.sourceTypeFilter === type) return;
    this.sourceTypeFilter = type;
    const srcfbAll = this.$g("srcfb-all");
    const srcfbMov = this.$g("srcfb-movie");
    const srcfbTv = this.$g("srcfb-tv");
    if (srcfbAll) srcfbAll.classList.toggle("active", type === "all");
    if (srcfbMov) srcfbMov.classList.toggle("active", type === "movie");
    if (srcfbTv) srcfbTv.classList.toggle("active", type === "tv");
    this.applySourceFilters();
  },
  loadMoreSourceCatalog: async function () {
    if (this.sourceLoadingMore) return;
    const grid = this.$g("source-titles-grid");
    if (!grid) return;
    const displayList = this.sourceFilteredTitles || this.sourceAllTitles;
    if (displayList && this.sourceRenderedCount < displayList.length) {
      const nextBatch = displayList.slice(
        this.sourceRenderedCount,
        this.sourceRenderedCount + 30,
      );
      if (nextBatch.length > 0) {
        const cardsHtml = nextBatch
          .map((item) => {
            const type = item.media_type || (item.title ? "movie" : "tv");
            return this.buildCard(item, type);
          })
          .join("");
        grid.insertAdjacentHTML("beforeend", cardsHtml);
        this.sourceRenderedCount += nextBatch.length;
        this.markImgsLoaded(grid.querySelectorAll("img"));
        return;
      }
    }
    const hasFilterActive =
      this.sourceFilterKeys &&
      (this.sourceFilterKeys.some(
        (k) => this.getMultiList(k, null, "source").length > 0,
      ) ||
        (this.$g("sf-type")?.value &&
          this.$g("sf-type")?.value !== "popular") ||
        Boolean((this.sourceSearchQuery || "").trim()));
    if (hasFilterActive) return;
    const currentFilter = this.sourceTypeFilter || "all";
    const canFetchMovie =
      currentFilter !== "tv" &&
      this.currentSourceType === "company" &&
      this.sourceMoviePage < this.sourceMovieTotalPages &&
      this.sourceMoviePage < 100;
    const canFetchTv =
      currentFilter !== "movie" &&
      this.sourceTvPage < this.sourceTvTotalPages &&
      this.sourceTvPage < 100;
    if (!canFetchMovie && !canFetchTv) return;

    this.sourceLoadingMore = true;
    const key = this.getTmdbAnimeKey();
    try {
      const reqs = [];
      if (canFetchMovie) {
        this.sourceMoviePage++;
        reqs.push(
          this.api(
            "/discover/movie",
            {
              with_companies: this.currentSourceId,
              sort_by: "popularity.desc",
              page: this.sourceMoviePage,
            },
            key,
          ).then((res) =>
            res && Array.isArray(res.results)
              ? res.results.map((i) =>
                  Object.assign({}, i, { media_type: "movie" }),
                )
              : [],
          ),
        );
      }
      if (canFetchTv) {
        this.sourceTvPage++;
        const p =
          this.currentSourceType === "network"
            ? {
                with_networks: this.currentSourceId,
                sort_by: "popularity.desc",
                page: this.sourceTvPage,
              }
            : {
                with_companies: this.currentSourceId,
                sort_by: "popularity.desc",
                page: this.sourceTvPage,
              };
        reqs.push(
          this.api("/discover/tv", p, key).then((res) =>
            res && Array.isArray(res.results)
              ? res.results.map((i) =>
                  Object.assign({}, i, { media_type: "tv" }),
                )
              : [],
          ),
        );
      }
      const resultsLists = await Promise.all(reqs);
      if (this.currentView !== "source") return;
      const incoming = [];
      resultsLists.forEach((list) => incoming.push(...list));
      const seen = new Set(
        (this.sourceAllTitles || []).map((i) => String(i.id)),
      );
      const newItems = [];
      for (const item of incoming) {
        if (!item || !item.id || seen.has(String(item.id))) continue;
        seen.add(String(item.id));
        const type = item.media_type || (item.title ? "movie" : "tv");
        if (this.isBlocked && this.isBlocked(item, type)) continue;
        newItems.push(item);
      }
      if (newItems.length > 0) {
        this.sourceAllTitles.push(...newItems);
        let nextDisplayItems = newItems;
        if (currentFilter !== "all") {
          nextDisplayItems = newItems.filter(
            (item) =>
              (item.media_type || (item.title ? "movie" : "tv")) ===
              currentFilter,
          );
          this.sourceFilteredTitles = (this.sourceFilteredTitles || []).concat(
            nextDisplayItems,
          );
        } else {
          this.sourceFilteredTitles = this.sourceAllTitles;
        }
        const nextBatch = nextDisplayItems.slice(0, 30);
        if (nextBatch.length > 0) {
          const cardsHtml = nextBatch
            .map((item) => {
              const type = item.media_type || (item.title ? "movie" : "tv");
              return this.buildCard(item, type);
            })
            .join("");
          grid.insertAdjacentHTML("beforeend", cardsHtml);
          this.sourceRenderedCount += nextBatch.length;
          this.markImgsLoaded(grid.querySelectorAll("img"));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.sourceLoadingMore = false;
    }
  },
  setSourceYearSort: function (order) {
    if (this.sourceYearSort === order) return;
    this.sourceYearSort = order;
    const descBtn = this.$g("source-year-sort-desc-btn");
    const ascBtn = this.$g("source-year-sort-asc-btn");
    if (descBtn) descBtn.classList.toggle("active", order === "desc");
    if (ascBtn) ascBtn.classList.toggle("active", order === "asc");
    if (this.sourceAllTitles) {
      this.applySourceFilters();
    } else if (this.sourceTitles) {
      this.renderSourceCatalog(this.sourceTitles);
    }
  },
});
