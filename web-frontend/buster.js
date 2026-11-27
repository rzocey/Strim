var app = window.app || {};
Object.assign(app, {
  animeCache: {},
  aniCache: {},
  aniInFlight: {},
  getAniCover(coverObj) {
    if (!coverObj) return "";
    if (typeof coverObj === "string") return coverObj;
    const pq = this.uiPrefs?.posterQuality || "high";
    const preferred = this.getImageSize("ani", pq);
    return (
      coverObj[preferred] ||
      coverObj.large ||
      coverObj.extraLarge ||
      coverObj.medium ||
      ""
    );
  },
  getAnimeBaseTitle(str) {
    if (!str) return "";
    return str
      .replace(
        /\s*[:\-]?\s*(?:(?:the\s+)?final\s+season|(?:[0-9]+(?:st|nd|rd|th)?|first|second|third|fourth|fifth)?\s*(?:season|cour|part)\s*(?:[0-9]+(?:st|nd|rd|th)?)?).*$/i,
        "",
      )
      .replace(/\s+(?:[0-9]+|ii|iii|iv|v|vi)\s*$/i, "")
      .replace(/\s*\(tv\)\s*$/i, "")
      .replace(/\s*\(season\s*\d+\)\s*$/i, "")
      .trim();
  },
  isAnimeSeasonSequel(str) {
    if (!str) return false;
    if (
      /\b(?:season\s*0*([2-9]|\d{2,})|0*([2-9]|\d{2,})(?:st|nd|rd|th)\s+season|part\s*0*([2-9]|\d{2,})|cour\s*0*([2-9]|\d{2,})|0*([2-9]|\d{2,})(?:nd|rd|th)\s+cour|s0*([2-9]|\d{2,})|(?:the\s+)?final\s+season|(?:second|third|fourth|fifth|sixth)\s+(?:season|cour|part)|\b[2-9](?:nd|rd|th)\b|\b(?:ii|iii|iv|v|vi|vii|viii|ix|x)\b)\b/i.test(
        str,
      )
    )
      return true;
    if (/(?:[:\-]\s*|\s+)(?:ii|iii|iv|v|vi|vii|viii|ix|x|[2-9])\s*$/i.test(str))
      return true;
    return false;
  },
  isUnreleasedAniMedia(m) {
    if (!m) return false;
    if (m.status === "CANCELLED" || m.status === "NOT_YET_RELEASED")
      return true;
    if (m.startDate?.year) {
      const sDate = new Date(
        m.startDate.year,
        (m.startDate.month || 1) - 1,
        m.startDate.day || 1,
      );
      if (sDate > new Date()) return true;
    }
    return false;
  },
  toAniCard(m, isMovie = false) {
    if (!m) return null;
    this.seedAniMediaCache(m);
    const isMovieFmt = isMovie || m.format === "MOVIE";
    const tvType =
      m.format === "OVA"
        ? "OVA"
        : m.format === "ONA"
          ? "ONA"
          : m.format === "SPECIAL"
            ? "Special"
            : m.format === "TV_SHORT"
              ? "Short"
              : "Scripted";
    const rawTitle =
      m.title?.english || m.title?.romaji || m.title?.userPreferred || "";
    const title = rawTitle
      .replace(/\s*[:\-–—~]?\s*\((?:tv|tv\s+series)\)\s*$/i, "")
      .trim();
    const dateStr = m.startDate?.year
      ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}`
      : "";
    return {
      id: "ani_" + m.id,
      ani_id: m.id,
      mal_id: m.idMal || m.id,
      title: title,
      name: title,
      romaji: m.title?.romaji || "",
      media_type: isMovieFmt ? "movie" : "tv",
      type: isMovieFmt ? "movie" : tvType,
      animeFormat: m.format || null,
      poster_path:
        (this.animeCache &&
          this.animeCache["ani_" + m.id] &&
          this.animeCache["ani_" + m.id].tmdbPoster) ||
        this.getAniCover(m.coverImage) ||
        m.coverImage?.extraLarge ||
        m.coverImage?.large ||
        m.coverImage?.medium ||
        "",
      backdrop_path:
        m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || "",
      year: m.startDate?.year ? String(m.startDate.year) : "",
      release_date: dateStr,
      first_air_date: dateStr,
      vote_average: m.averageScore ? m.averageScore / 10 : 0,
      overview: (m.description || "").replace(/<[^>]*>/g, ""),
      country: m.countryOfOrigin || "JP",
      genres: m.genres || [],
      runtime: m.duration || null,
      studios: (m.studios?.nodes || [])
        .filter((s) => s?.isAnimationStudio)
        .map((s) => s.name),
      season: this.resolveAnimeSeason(m),
      episodes: m.episodes || null,
      trailer: m.trailer || null,
      is_anime: true,
      is_anilist: true,
    };
  },
  ANI_MEDIA_QUERY: `query ($id: Int) { Media(id: $id) { id idMal format season seasonYear studios(isMain: true) { nodes { name isAnimationStudio } } title { romaji english userPreferred native } bannerImage coverImage { extraLarge large } description episodes duration averageScore status startDate { year month day } genres countryOfOrigin trailer { id site } relations { edges { relationType node { id idMal format status episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large medium } relations { edges { relationType node { id idMal format status episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large medium } } } } } } } } }`,
  animePrewarmQueue: [],
  animePrewarmPending: new Set(),
  animePrewarmActive: false,
  async enrichAnimeTmdbPosters(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const targets = items.filter(
      (it) => it && String(it.id).startsWith("ani_"),
    );
    if (targets.length === 0) return;
    const swapCardPoster = (idStr, posterPath) => {
      if (!posterPath) return;
      const url = this.getImg(posterPath, "poster");
      document
        .querySelectorAll(
          `.poster-card[data-show-id="${idStr}"] img.poster-img`,
        )
        .forEach((img) => {
          if (img.getAttribute("src") !== url) {
            img.classList.remove("loaded");
            img.src = url;
          }
        });
      if (this.cardItemCache && this.cardItemCache[idStr]) {
        this.cardItemCache[idStr].poster_path = posterPath;
      }
    };
    const pending = [];
    targets.forEach((it) => {
      const idStr = String(it.id);
      const cached = this.animeCache && this.animeCache[idStr];
      if (cached && cached.tmdbPosterMiss) return;
      if (cached && cached.tmdbPoster) {
        it.poster_path = cached.tmdbPoster;
        swapCardPoster(idStr, cached.tmdbPoster);
        return;
      }
      pending.push(it);
    });
    if (pending.length === 0) return;
    const tmdbKey = this.getTmdbMediaKey();
    const cleanAniTitle = (s) =>
      (s || "")
        .replace(/\s*\(\d{4}\)\s*$/i, "")
        .replace(/\s*[:\-–—~]?\s*\((?:tv|tv\s+series|ona|web)\)\s*$/i, "")
        .replace(/\s+\b(?:tv)\b\s*$/i, "")
        .trim();
    const stripOvaWord = (s) =>
      cleanAniTitle(s)
        .replace(/\s*[:\-–—~]?\s*\((?:ova|special|specials)\)\s*$/i, "")
        .replace(/\s+\b(?:ova|special|specials)\b\s*$/i, "")
        .trim();
    const getBase = (s) =>
      cleanAniTitle(s)
        .split(/[:\-–—~]/)[0]
        .trim();
    const norm = (s) =>
      cleanAniTitle(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    for (let i = 0; i < pending.length; i += pending.length) {
      const batch = pending;
      const raceAll = (arr) =>
        Promise.race([
          Promise.all(arr),
          new Promise((r) => setTimeout(r, 700)),
        ]);
      await raceAll(
        batch.map(async (it) => {
          const idStr = String(it.id);
          const mType = it.media_type === "movie" ? "movie" : "tv";
          const rawQ = it.title || it.name || it.romaji || "";
          const cachedMeta = (this.animeCache && this.animeCache[idStr]) || {};
          const fmt = it.animeFormat || cachedMeta.animeFormat || it.type || "";
          const isOvaOrSpecial =
            ["OVA", "SPECIAL", "Special"].includes(fmt) ||
            /\b(?:ova|special|specials)\b/i.test(rawQ) ||
            /\b(?:ova|special|specials)\b/i.test(it.romaji || "");
          const isSpinoffOrSub =
            isOvaOrSpecial ||
            ["TV_SHORT", "ONA", "Short"].includes(fmt) ||
            Boolean(cachedMeta.hasParent) ||
            this.isAnimeSeasonSequel(rawQ) ||
            this.isAnimeSeasonSequel(it.romaji || "");
          const cleanQ = cleanAniTitle(rawQ);
          const baseQ = getBase(rawQ);
          const strippedEng = stripOvaWord(rawQ);
          const strippedRom = stripOvaWord(it.romaji || "");
          const romQ = cleanAniTitle(it.romaji || "");
          const queries = [
            ...new Set(
              (isSpinoffOrSub
                ? [cleanQ, romQ, strippedEng, strippedRom]
                : [cleanQ, romQ, baseQ]
              ).filter((q) => q && q.length >= 2),
            ),
          ];
          if (queries.length === 0) return;
          const fullNorms = [
            ...new Set([cleanQ, romQ].map(norm).filter(Boolean)),
          ];
          const strippedNorms = [
            ...new Set([strippedEng, strippedRom].map(norm).filter(Boolean)),
          ];
          const forbiddenNorms = new Set();
          (cachedMeta.parentTitles || []).forEach((pt) => {
            const pn = norm(pt);
            const pbn = norm(getBase(pt));
            const psn = norm(stripOvaWord(pt));
            if (pn && !fullNorms.includes(pn)) forbiddenNorms.add(pn);
            if (pbn && !fullNorms.includes(pbn)) forbiddenNorms.add(pbn);
            if (psn && !fullNorms.includes(psn)) forbiddenNorms.add(psn);
          });
          [rawQ, it.romaji || ""].forEach((t) => {
            const bn = norm(getBase(t));
            const sn = norm(stripOvaWord(t));
            const fn = norm(cleanAniTitle(t));
            if (bn && fn && bn !== fn) forbiddenNorms.add(bn);
            if (isOvaOrSpecial && sn && fn && sn !== fn) forbiddenNorms.add(sn);
          });
          const subNorms = [rawQ, it.romaji || ""]
            .map((t) => {
              const pts = stripOvaWord(t)
                .split(/[:\-–—~]/)
                .map((s) => s.trim())
                .filter(Boolean);
              return pts.length > 1 ? norm(pts[pts.length - 1]) : "";
            })
            .filter((s) => s.length >= 3);
          const itNorms =
            !isSpinoffOrSub && fmt === "TV"
              ? [...new Set([...fullNorms, norm(baseQ)].filter(Boolean))]
              : fullNorms;
          const itYr = parseInt(it.year, 10) || 0;
          try {
            let match = null;
            for (const qStr of queries) {
              const [res, resAlt] = await Promise.all([
                this.api(`/search/${mType}`, { query: qStr }, tmdbKey),
                isOvaOrSpecial && mType === "tv"
                  ? this.api("/search/movie", { query: qStr }, tmdbKey)
                  : Promise.resolve(null),
              ]);
              const hits = [
                ...((res && res.results) || []),
                ...((resAlt && resAlt.results) || []),
              ];
              match = hits.find((h) => {
                if (!h || !h.poster_path) return false;
                const isAnim =
                  this.isAnimeItem(h) ||
                  (Array.isArray(h.genre_ids) &&
                    h.genre_ids.includes(16) &&
                    ["JP", "KR", "CN"].some(
                      (c) =>
                        (h.origin_country || []).includes(c) ||
                        h.original_language ===
                          (c === "JP" ? "ja" : c === "KR" ? "ko" : "zh"),
                    ));
                if (!isAnim) return false;
                const hN = norm(h.title || h.name);
                const hOn = norm(h.original_title || h.original_name);
                const hYr = parseInt(this.getItemYear(h), 10) || 0;
                const maxYrDiff = isOvaOrSpecial ? 1 : 2;
                const yrOk = !itYr || !hYr || Math.abs(hYr - itYr) <= maxYrDiff;
                if (!yrOk) return false;
                const hNs = norm(stripOvaWord(h.title || h.name));
                const hOns = norm(
                  stripOvaWord(h.original_title || h.original_name),
                );
                if (
                  !fullNorms.includes(hN) &&
                  !fullNorms.includes(hOn) &&
                  (forbiddenNorms.has(hN) ||
                    forbiddenNorms.has(hOn) ||
                    forbiddenNorms.has(hNs) ||
                    forbiddenNorms.has(hOns))
                )
                  return false;
                if (fullNorms.some((tn) => hN === tn || hOn === tn))
                  return true;
                if (
                  isOvaOrSpecial &&
                  strippedNorms.some(
                    (tn) =>
                      !forbiddenNorms.has(tn) &&
                      (hN === tn || hOn === tn || hNs === tn || hOns === tn),
                  )
                ) {
                  return (
                    subNorms.length === 0 ||
                    subNorms.some((sn) => hN.includes(sn) || hOn.includes(sn))
                  );
                }
                if (isSpinoffOrSub && subNorms.length > 0) {
                  return (
                    subNorms.some(
                      (sn) =>
                        sn.length >= 5 && (hN.endsWith(sn) || hOn.endsWith(sn)),
                    ) &&
                    [norm(getBase(rawQ)), norm(getBase(it.romaji || ""))]
                      .filter(Boolean)
                      .some((b) => hN.startsWith(b) || hOn.startsWith(b))
                  );
                }
                return !isSpinoffOrSub &&
                  fmt === "TV" &&
                  (!itYr || !hYr || Math.abs(hYr - itYr) <= 1)
                  ? itNorms.some((tn) => hN === tn || hOn === tn)
                  : false;
              });
              if (match) break;
            }
            if (match && match.poster_path) {
              it.poster_path = match.poster_path;
              if (!this.animeCache) this.animeCache = {};
              if (!this.animeCache[idStr]) this.animeCache[idStr] = {};
              this.animeCache[idStr].tmdbPoster = match.poster_path;
              swapCardPoster(idStr, match.poster_path);
              this.persistCache("anime");
            } else {
              if (!this.animeCache) this.animeCache = {};
              if (!this.animeCache[idStr]) this.animeCache[idStr] = {};
              this.animeCache[idStr].tmdbPosterMiss = true;
              this.persistCache("anime");
            }
          } catch (e) {}
        }),
      );
    }
  },
  queueAnimePrewarm(items) {
    if (!items) return;
    const arr = Array.isArray(items) ? items : [items];
    if (!this.animePrewarmQueue) this.animePrewarmQueue = [];
    if (!this.animePrewarmPending) this.animePrewarmPending = new Set();
    arr.forEach((it) => {
      if (!it || !it.id || String(it.id).startsWith("ani_")) return;
      const type = it.media_type || (it.name ? "tv" : "movie");
      if (type !== "tv") return;
      const isAnime =
        it.isAnime ||
        it.is_anilist ||
        (this.isAnimeItem && this.isAnimeItem(it)) ||
        (it.genre_ids && it.genre_ids.includes(16)) ||
        (it.genres &&
          it.genres.some(
            (g) =>
              g.id === 16 || (g.name && g.name.toLowerCase() === "animation"),
          )) ||
        (it.origin_country && it.origin_country.includes("JP")) ||
        it.country === "JP";
      if (!isAnime) return;
      const idStr = String(it.id);
      const cS1 =
        this.animeCache &&
        (this.animeCache[`${idStr}_s1`] || this.animeCache[idStr]);
      if (
        cS1 &&
        cS1._chainComplete &&
        Array.isArray(cS1.sequelChain) &&
        cS1.sequelChain.length > 0
      )
        return;
      if (this.animePrewarmPending.has(idStr)) return;
      if (this.animePrewarmQueue.length >= 6) return;
      this.animePrewarmPending.add(idStr);
      this.animePrewarmQueue.push(it);
    });
    this.processAnimePrewarmQueue();
  },
  processAnimePrewarmQueue() {
    if (
      this.animePrewarmActive ||
      !this.animePrewarmQueue ||
      this.animePrewarmQueue.length === 0
    )
      return;
    const it = this.animePrewarmQueue.shift();
    if (!it || !it.id || String(it.id).startsWith("ani_")) return;
    this.animePrewarmActive = true;
    const next = () => {
      setTimeout(() => {
        this.animePrewarmActive = false;
        this.processAnimePrewarmQueue();
      }, 1200);
    };
    const id = it.id;
    const showCacheKey = `tv_${id}`;
    const cachedShow =
      this.getShowDetailsCache(showCacheKey) || this.getShowDetailsCache(id);
    const showData = cachedShow?.data || cachedShow;
    if (showData && showData.id) {
      this.fetchAnimeInfo(showData, 1, false)
        .then((ai) => {
          if (ai && ai.sequelChain && ai.sequelChain.length > 0) {
            const validS = (showData.seasons || []).filter((s) =>
              this.isSeasonAired(s),
            );
            if (validS.length > 1 && ai.sequelChain.length > validS.length) {
              ai.hybridSeasonList = this.buildHybridSeasonList(
                validS,
                ai.sequelChain,
                showData,
              );
            }
          }
        })
        .catch(() => {})
        .finally(next);
    } else {
      this.api(`/tv/${id}`, {
        append_to_response:
          "credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers",
        include_image_language: "en,null",
        include_video_language: "en,null",
      })
        .then((res) => {
          if (res && res.id) {
            if (!this.showDetailsCache) this.showDetailsCache = {};
            const canonKey = `tv_${res.id}`;
            const cleanEntry = this.sanitizeShowDetails({
              data: res,
              anilistMedia: null,
              resolvedId: res.id,
              resolvedType: "tv",
            });
            this.showDetailsCache[canonKey] = cleanEntry;
            if (`tv_${id}` !== canonKey)
              this.showDetailsCache[`tv_${id}`] = { _ref: canonKey };
            this.persistCache("show");
            if (this.isAnimeItem(res)) {
              return this.fetchAnimeInfo(res, 1, false).then((ai) => {
                if (ai && ai.sequelChain && ai.sequelChain.length > 0) {
                  const validS = (res.seasons || []).filter((s) =>
                    this.isSeasonAired(s),
                  );
                  if (
                    validS.length > 1 &&
                    ai.sequelChain.length > validS.length
                  ) {
                    ai.hybridSeasonList = this.buildHybridSeasonList(
                      validS,
                      ai.sequelChain,
                      res,
                    );
                  }
                }
              });
            }
          }
        })
        .catch(() => {})
        .finally(next);
    }
  },
  isAniCached(query, variables = {}) {
    if (!this.aniCache) return false;
    const cleanQ = (query || "").replace(/\s+/g, " ").trim();
    const normV = this.normalizeParams(variables);
    const cacheKey = normV ? `${cleanQ}?${normV}` : cleanQ;
    return Boolean(
      this.aniCache && this.aniCache[cacheKey] && this.aniCache[cacheKey].data,
    );
  },
  async aniApi(query, variables = {}, forceRefresh = false) {
    const cleanQ = (query || "").replace(/\s+/g, " ").trim();
    const normV = this.normalizeParams(variables);
    const cacheKey = normV ? `${cleanQ}?${normV}` : cleanQ;
    if (!forceRefresh && this.aniCache) {
      const c = this.lruGet(this.aniCache, cacheKey);
      if (c) {
        const isDynamic =
          cleanQ.includes("TRENDING_DESC") || cleanQ.includes("Page");
        const isStale =
          isDynamic && c._ts && Date.now() - c._ts > 30 * 60 * 1000;
        if (isStale && (!this.aniInFlight || !this.aniInFlight[cacheKey])) {
          c._ts = Date.now();
          setTimeout(() => {
            this.aniApi(query, variables, true).catch(() => {});
          }, 120);
        }
        return c;
      }
    }
    return this._runInFlight("aniInFlight", cacheKey, async () => {
      const fetchAni = async () => {
        let tId = null;
        const ctrl =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        const hasAbortTimeout =
          typeof AbortSignal !== "undefined" &&
          typeof AbortSignal.timeout === "function";
        const sig = hasAbortTimeout
          ? AbortSignal.timeout(7000)
          : ctrl
            ? ctrl.signal
            : undefined;
        if (!hasAbortTimeout && ctrl)
          tId = setTimeout(() => ctrl.abort(), 7000);
        try {
          return await fetch(ANILIST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
            ...(sig ? { signal: sig } : {}),
          });
        } finally {
          if (tId) clearTimeout(tId);
        }
      };
      try {
        const r = await fetchAni();
        if (r.status === 429) {
          await new Promise((res) => setTimeout(res, 1500));
          const retryR = await fetchAni();
          if (retryR.status === 429) return null;
          const retryData = await retryR.json();
          if (retryData && retryData.data) {
            retryData._ts = Date.now();
            this.lruSet(this.aniCache, cacheKey, retryData, "ani");
          }
          return retryData;
        }
        const data = await r.json();
        if (data && data.data) {
          data._ts = Date.now();
          this.lruSet(this.aniCache, cacheKey, data, "ani");
        }
        return data;
      } catch (e) {
        return null;
      }
    });
  },
  resolveAnimeSeason(media) {
    if (!media) return null;
    if (media.season) return media.season;
    const mo =
      media.startDate?.month ||
      (typeof media.month === "number" ? media.month : null);
    if (mo >= 1 && mo <= 3) return "WINTER";
    if (mo >= 4 && mo <= 6) return "SPRING";
    if (mo >= 7 && mo <= 9) return "SUMMER";
    if (mo >= 10 && mo <= 12) return "FALL";
    return null;
  },
  seedAniMediaCache(m) {
    if (!m || !m.id) return null;
    if (!this.animeCache) this.animeCache = {};
    const studios = (m.studios?.nodes || [])
      .filter((s) => s?.isAnimationStudio)
      .map((s) => s.name);
    const entry = {
      aniId: m.id,
      malId: m.idMal || m.id,
      animeFormat: m.format,
      romaji: m.title?.romaji || "",
      season: this.resolveAnimeSeason(m),
      seasonYear: m.seasonYear || m.startDate?.year || null,
      episodes: m.episodes || null,
      genres: m.genres || [],
      studios: studios,
      trailer: m.trailer || null,
      poster_path: this.getAniCover(m.coverImage) || "",
      relations: m.relations || null,
    };
    const edges = m.relations?.edges || [];
    const pEdges = edges.filter(
      (e) =>
        ["PARENT", "MAIN_STORY", "FULL_STORY"].includes(e?.relationType) ||
        (m.format !== "TV" && e?.relationType === "PREQUEL"),
    );
    entry.hasParent = pEdges.length > 0;
    entry.parentTitles = [];
    pEdges.forEach((e) => {
      const nt = e?.node?.title;
      if (nt)
        [nt.english, nt.romaji, nt.userPreferred]
          .filter(Boolean)
          .forEach((t) => entry.parentTitles.push(t));
    });
    const tvSeq = edges.filter(
      (e) =>
        e.relationType === "SEQUEL" &&
        ["TV", "TV_SHORT", "ONA"].includes(e.node?.format),
    );
    if (
      tvSeq.length > 0 &&
      tvSeq.some(
        (e) => e.node?.episodes && (e.node?.title || e.node?.startDate),
      )
    ) {
      const chain = [
        {
          id: m.id,
          idMal: m.idMal || m.id,
          episodes: m.episodes || null,
          format: m.format,
          season: 1,
          broadcastSeason: m.season || this.resolveAnimeSeason(m) || null,
          startDate: m.startDate || null,
          title: m.title || null,
          poster_path: this.getAniCover(m.coverImage) || "",
        },
      ];
      let curS = 1;
      tvSeq.sort(
        (a, b) =>
          (a.node?.startDate?.year || 0) - (b.node?.startDate?.year || 0),
      );
      tvSeq.forEach((e) => {
        const n = e.node;
        if (!n || n.status === "CANCELLED") return;
        curS++;
        chain.push({
          id: n.id,
          idMal: n.idMal || n.id,
          episodes: n.episodes || null,
          format: n.format,
          season: curS,
          broadcastSeason: n.season || this.resolveAnimeSeason(n) || null,
          startDate: n.startDate || null,
          title: n.title || null,
          poster_path: this.getAniCover(n.coverImage) || "",
        });
      });
      if (chain.length > 1) entry.sequelChain = chain;
    }
    this.animeCache["ani_" + m.id] = Object.assign(
      this.animeCache["ani_" + m.id] || {},
      entry,
    );
    return entry;
  },
  async resolveAniStudioStaffIds(aniStudioIds, aniStaffIds) {
    if (
      (!aniStudioIds || aniStudioIds.length === 0) &&
      (!aniStaffIds || aniStaffIds.length === 0)
    )
      return null;
    const cacheKey = `st_sf_v3_${(aniStudioIds || []).join(",")}_${(aniStaffIds || []).join(",")}_${this.aniStaffRoleFilter || "all"}`;
    if (this.animeCache) {
      const c = this.lruGet(this.animeCache, cacheKey);
      if (c) return c;
    }
    const idSets = [];
    if (aniStudioIds && aniStudioIds.length > 0) {
      let stFields = "";
      for (let p = 1; p <= 8; p++) {
        stFields += ` m${p}: media(page: ${p}, perPage: 25, sort: [POPULARITY_DESC]) { nodes { id title { romaji english userPreferred } relations { edges { relationType node { id format title { romaji english userPreferred } } } } } }`;
      }
      const stGql = `query ($ids: [Int]) { Page(page: 1, perPage: 25) { studios(id_in: $ids) { id${stFields} } } }`;
      const stRes = await this.aniApi(stGql, { ids: aniStudioIds });
      if (stRes === null) return null;
      const stSet = new Set();
      let pQueue = [];
      const getBases = (tObj) =>
        [tObj?.english, tObj?.romaji, tObj?.userPreferred]
          .filter(Boolean)
          .map((t) => this.normTitle(this.getAnimeBaseTitle(t)))
          .filter((b) => b && b.length >= 3);
      const collectPrequels = (nodes) => {
        (nodes || []).forEach((n) => {
          if (!n?.id) return;
          stSet.add(n.id);
          const nBases = getBases(n.title);
          (n.relations?.edges || []).forEach((e) => {
            if (
              (e.relationType === "PREQUEL" || e.relationType === "PARENT") &&
              e.node?.id &&
              ["TV", "TV_SHORT", "ONA", "OVA"].includes(e.node.format) &&
              !stSet.has(e.node.id)
            ) {
              const eBases = getBases(e.node.title);
              if (
                nBases.length > 0 &&
                eBases.some((eb) => nBases.includes(eb))
              ) {
                stSet.add(e.node.id);
                pQueue.push(e.node.id);
              }
            }
          });
        });
      };
      (stRes?.data?.Page?.studios || []).forEach((st) => {
        const allNodes = [];
        for (let p = 1; p <= 8; p++) {
          if (Array.isArray(st?.[`m${p}`]?.nodes))
            allNodes.push(...st[`m${p}`].nodes);
        }
        collectPrequels(allNodes);
      });
      for (let hop = 0; hop < 4 && pQueue.length > 0; hop++) {
        const batch = [...new Set(pQueue)].slice(0, 50);
        pQueue = [];
        const pGql = `query ($ids: [Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id title { romaji english userPreferred } relations { edges { relationType node { id format title { romaji english userPreferred } } } } } } }`;
        const pRes = await this.aniApi(pGql, { ids: batch });
        collectPrequels(pRes?.data?.Page?.media);
      }
      idSets.push(stSet);
    }
    if (aniStaffIds && aniStaffIds.length > 0) {
      const staffRolesMap = new Map();
      const missingIds = [];
      aniStaffIds.forEach((id) => {
        const c = this.animeCache
          ? this.lruGet(this.animeCache, "sf_roles_" + id)
          : null;
        if (c) staffRolesMap.set(id, c);
        else missingIds.push(id);
      });
      if (missingIds.length > 0) {
        const staffAccum = new Map();
        missingIds.forEach((id) =>
          staffAccum.set(id, {
            main: new Set(),
            other: new Set(),
            all: new Set(),
          }),
        );
        let currentStart = 1;
        const batchCount = 8;
        const maxBatches = 3;
        for (let b = 0; b < maxBatches; b++) {
          let fields = "";
          if (b === 0)
            fields +=
              " staffMedia(page: 1, perPage: 25, sort: [POPULARITY_DESC]) { nodes { id } }";
          for (let i = 0; i < batchCount; i++) {
            const p = currentStart + i;
            fields += ` m${p}: characterMedia(page: ${p}, perPage: 25, sort: [POPULARITY_DESC]) { pageInfo { hasNextPage } edges { characterRole node { id } } }`;
          }
          const sfGql = `query ($ids: [Int]) { Page(page: 1, perPage: 25) { staff(id_in: $ids) { id${fields} } } }`;
          const sfRes = await this.aniApi(sfGql, { ids: missingIds });
          if (!sfRes || !sfRes.data) {
            if (b === 0 && sfRes === null) return null;
            break;
          }
          const staffList = sfRes.data.Page?.staff || [];
          let anyHasNext = false;
          staffList.forEach((sf) => {
            const acc = staffAccum.get(sf.id);
            if (!acc) return;
            if (sf.staffMedia?.nodes) {
              sf.staffMedia.nodes.forEach((n) => {
                if (n?.id) {
                  acc.all.add(n.id);
                  acc.other.add(n.id);
                }
              });
            }
            for (let i = 0; i < batchCount; i++) {
              const p = currentStart + i;
              const m = sf[`m${p}`];
              if (!m) continue;
              if (m.pageInfo?.hasNextPage) anyHasNext = true;
              (m.edges || []).forEach((e) => {
                if (!e.node?.id) return;
                acc.all.add(e.node.id);
                if (e.characterRole === "MAIN") acc.main.add(e.node.id);
                else if (
                  e.characterRole === "SUPPORTING" ||
                  e.characterRole === "BACKGROUND"
                )
                  acc.other.add(e.node.id);
              });
            }
          });
          if (!anyHasNext) break;
          currentStart += batchCount;
        }
        missingIds.forEach((id) => {
          const acc = staffAccum.get(id);
          const data = {
            main: acc ? Array.from(acc.main) : [],
            other: acc ? Array.from(acc.other) : [],
            all: acc ? Array.from(acc.all) : [],
          };
          staffRolesMap.set(id, data);
          if (!this.animeCache) this.animeCache = {};
          this.lruSet(this.animeCache, "sf_roles_" + id, data, "anime");
        });
      }
      const role = this.aniStaffRoleFilter;
      aniStaffIds.forEach((id) => {
        const d = staffRolesMap.get(id);
        const arr = d
          ? role === "main"
            ? d.main
            : role === "other"
              ? d.other
              : d.all
          : [];
        idSets.push(new Set(arr));
      });
    }
    let result = null;
    if (idSets.length === 1) result = Array.from(idSets[0]);
    else if (idSets.length > 1)
      result = Array.from(idSets[0]).filter((id) =>
        idSets.every((s) => s.has(id)),
      );
    if (Array.isArray(result) && result.length > 0) {
      if (!this.animeCache) this.animeCache = {};
      this.lruSet(this.animeCache, cacheKey, result, "anime");
    }
    return result;
  },
  similarScrollPos: 0,
  searchAniStudio: function (query, target) {
    this.runDebouncedSearch(
      "aniStudioTimer",
      this.$g("filter-ani-studio-drop"),
      query,
      async (q) => {
        const res = await this.aniApi(
          `query ($s: String) { Page(page: 1, perPage: 15) { studios(search: $s, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name isAnimationStudio } } }`,
          { s: q },
        );
        return (res?.data?.Page?.studios || [])
          .map((st) =>
            this.renderDropItemHtml(
              "aniStudio",
              st.id,
              st.name,
              st.isAnimationStudio ? "Studio" : "Producer",
              target,
            ),
          )
          .join("");
      },
    );
  },
  searchAniStaff: function (query, target) {
    this.runDebouncedSearch(
      "aniStaffTimer",
      this.$g("filter-ani-staff-drop"),
      query,
      async (q) => {
        const res = await this.aniApi(
          `query ($s: String) { Page(page: 1, perPage: 12) { staff(search: $s, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name { full } primaryOccupations } } }`,
          { s: q },
        );
        return (res?.data?.Page?.staff || [])
          .map((st) =>
            this.renderDropItemHtml(
              "aniStaff",
              st.id,
              st.name?.full || "Unknown",
              (st.primaryOccupations && st.primaryOccupations[0]) || "Staff",
              target,
            ),
          )
          .join("");
      },
    );
  },
  aniTagsCache: null,
  aniTagsPromise: null,
  async getAniTagsCache() {
    if (this.aniTagsCache && this.aniTagsCache.length > 0)
      return this.aniTagsCache;
    if (this.aniTagsPromise) return this.aniTagsPromise;
    this.aniTagsPromise = (async () => {
      try {
        const stored = this.$storeGet("aniTagsList", null);
        if (stored && Array.isArray(stored) && stored.length > 0) {
          this.aniTagsCache = stored;
          return stored;
        }
        const gql = `query { MediaTagCollection { name category isAdult } }`;
        const res = await this.aniApi(gql);
        const raw = res?.data?.MediaTagCollection || [];
        const valid = raw
          .filter((t) => !t.isAdult && t.name)
          .map((t) => ({
            id: t.name,
            name: t.name,
            category: t.category || "Theme",
          }));
        if (valid.length > 0) {
          this.aniTagsCache = valid;
          this.$storeSet("aniTagsList", valid);
          return valid;
        }
      } catch (e) {}
      return [];
    })();
    return this.aniTagsPromise;
  },
  async searchAniTag(query, target) {
    const drop = this.$g("filter-ani-tag-drop");
    if (!drop) return;
    const q = (query || "").trim().toLowerCase();
    if (this.checkEmptySearch(q, drop)) return;
    if (!this.aniTagsCache || this.aniTagsCache.length === 0)
      this.showDropLoader(drop);
    const tags = await this.getAniTagsCache();
    const filtered = tags.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)),
    );
    this.setDropHtml(
      drop,
      filtered
        .slice(0, 30)
        .map((t) =>
          this.renderDropItemHtml("aniTag", t.name, t.name, t.category, target),
        )
        .join(""),
    );
  },
  async fetchAnimeInfo(item, season = null, forceFresh = false) {
    if (!item) return null;
    const isMovie = item.media_type === "movie" || item.type === "movie";
    const sNum = isMovie ? null : parseInt(season) || 1;
    const cacheKey = isMovie ? String(item.id) : `${item.id}_s${sNum}`;
    if (!this.animeCache) this.animeCache = {};
    const cachedEntry = this.animeCache[cacheKey];
    if (
      !forceFresh &&
      cachedEntry &&
      (cachedEntry.aniId || cachedEntry.malId)
    ) {
      if (
        isMovie ||
        sNum > 1 ||
        (cachedEntry._chainComplete &&
          Array.isArray(cachedEntry.sequelChain) &&
          cachedEntry.sequelChain.length > 0)
      ) {
        return cachedEntry;
      }
    }
    return this._runInFlight("animeInFlight", cacheKey, async () => {
      if (!isMovie && sNum > 1) {
        const s1Info =
          this.animeCache[`${item.id}_s1`] ||
          (await this.fetchAnimeInfo(item, 1));
        if (s1Info) {
          const validS = (item.seasons || []).filter((s) =>
            this.isSeasonAired(s),
          );
          const tIdx = validS.findIndex((s) => s.season_number === sNum);
          if (tIdx > 0 && validS.length > 1) {
            if (!s1Info.sequelChain || s1Info.sequelChain.length <= 1) {
              let epOff = 0;
              for (let i = 1; i <= tIdx; i++)
                epOff += validS[i - 1].episode_count || 0;
              const resInfo = {
                ...s1Info,
                aniId: s1Info.aniId,
                malId: s1Info.malId,
                animeFormat: s1Info.animeFormat,
                epOffset: epOff,
                sequelChain: s1Info.sequelChain || [s1Info],
              };
              this.animeCache[cacheKey] = resInfo;
              this.persistCache("anime");
              return resInfo;
            }
            let cIdx = 0,
              epOff = 0;
            for (let i = 1; i <= tIdx; i++) {
              const prevEps = validS[i - 1].episode_count || 0;
              const sYr = parseInt(
                (validS[i].air_date || "").substring(0, 4),
                10,
              );
              const curEntry = s1Info.sequelChain?.[cIdx] || s1Info;
              const isReleasing =
                curEntry?.status === "RELEASING" ||
                s1Info.status === "RELEASING";
              const curLimit =
                isReleasing && !curEntry?.episodes
                  ? Infinity
                  : curEntry?.episodes || null;
              const nextSeq = (s1Info.sequelChain || [])
                .slice(cIdx + 1)
                .find((c) => !c._isSpecial && c.format !== "MOVIE");
              const nextSeqYr = nextSeq?.startDate?.year || null;
              const reachedNextSeq = Boolean(
                nextSeqYr && sYr && sYr >= nextSeqYr,
              );
              const yMatch = sYr
                ? (s1Info.sequelChain || []).findIndex(
                    (c, idx) =>
                      idx > cIdx &&
                      !c._isSpecial &&
                      c.format !== "MOVIE" &&
                      c.startDate?.year === sYr,
                  )
                : -1;
              if (curLimit && epOff + prevEps < curLimit && !reachedNextSeq) {
                epOff += prevEps;
              } else if (yMatch !== -1) {
                cIdx = yMatch;
                epOff = 0;
              } else if (
                s1Info.sequelChain &&
                cIdx + 1 < s1Info.sequelChain.length
              ) {
                let nextTvIdx = cIdx + 1;
                while (
                  nextTvIdx < s1Info.sequelChain.length &&
                  (s1Info.sequelChain[nextTvIdx]._isSpecial ||
                    s1Info.sequelChain[nextTvIdx].format === "MOVIE")
                )
                  nextTvIdx++;
                if (nextTvIdx < s1Info.sequelChain.length) {
                  cIdx = nextTvIdx;
                  epOff = 0;
                } else {
                  cIdx = -1;
                  break;
                }
              } else {
                cIdx = -1;
                break;
              }
            }
            if (cIdx >= 0) {
              const entry = s1Info.sequelChain?.[cIdx] || s1Info;
              const remainingChain =
                s1Info.sequelChain && s1Info.sequelChain.length > 0
                  ? s1Info.sequelChain.slice(cIdx)
                  : [entry];
              const resInfo = {
                ...s1Info,
                aniId: entry.id,
                malId: entry.idMal || entry.id,
                animeFormat: entry.format || s1Info.animeFormat,
                epOffset: epOff,
                sequelChain: remainingChain,
              };
              this.animeCache[cacheKey] = resInfo;
              this.persistCache("anime");
              return resInfo;
            }
          }
        }
      }
      const cleanText = (str) =>
        (str || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
      const rawTitle = item.name || item.title || "";
      const rawOrig = item.original_name || item.original_title || "";
      const baseTitle = cleanText(rawTitle);
      const origTitle = cleanText(rawOrig);
      if (!baseTitle && !origTitle) return null;
      let animeFormat = isMovie ? "MOVIE" : "TV";
      const queries = [];
      const romajiAlt =
        this.getTmdbRomaji(item) ||
        this.animeCache[String(item.id)]?.romaji ||
        "";
      if (isMovie) {
        if (baseTitle) {
          queries.push(baseTitle);
          const stripped = baseTitle
            .replace(/\s*[:\-]\s*the\s+movie$/i, "")
            .replace(/\s+the\s+movie$/i, "")
            .trim();
          if (stripped && stripped !== baseTitle) queries.push(stripped);
        }
        if (romajiAlt) queries.push(cleanText(romajiAlt));
        if (origTitle && origTitle !== baseTitle) queries.push(origTitle);
      } else if (sNum <= 1) {
        if (baseTitle) queries.push(baseTitle);
        if (romajiAlt && romajiAlt !== baseTitle)
          queries.push(cleanText(romajiAlt));
        if (origTitle && origTitle !== baseTitle) queries.push(origTitle);
      } else {
        const sObj = (item.seasons || []).find((s) => s.season_number === sNum);
        const sName = sObj ? cleanText(sObj.name) : "";
        const roman = {
          2: "II",
          3: "III",
          4: "IV",
          5: "V",
          6: "VI",
          7: "VII",
          8: "VIII",
        };
        const shortTitle = baseTitle.split(/[:\-]/)[0].trim();
        if (sName && !/^season\s+\d+$/i.test(sName)) {
          queries.push(`${baseTitle} ${sName}`);
          if (shortTitle && shortTitle !== baseTitle)
            queries.push(`${shortTitle} ${sName}`);
          queries.push(sName);
        }
        queries.push(`${baseTitle} Season ${sNum}`);
        if (shortTitle && shortTitle !== baseTitle)
          queries.push(`${shortTitle} Season ${sNum}`);
        queries.push(`${baseTitle} ${sNum}`);
        if (roman[sNum]) {
          queries.push(`${baseTitle} ${roman[sNum]}`);
          if (shortTitle && shortTitle !== baseTitle)
            queries.push(`${shortTitle} ${roman[sNum]}`);
        }
        if (romajiAlt && romajiAlt !== baseTitle) {
          if (sName && !/^season\s+\d+$/i.test(sName))
            queries.push(`${romajiAlt} ${sName}`);
          queries.push(`${romajiAlt} Season ${sNum}`);
          queries.push(`${romajiAlt} ${sNum}`);
          if (roman[sNum]) queries.push(`${romajiAlt} ${roman[sNum]}`);
        }
        if (origTitle) {
          queries.push(`${origTitle} Season ${sNum}`);
          queries.push(`${origTitle} ${sNum}`);
        }
      }
      const searchQueries = [...new Set(queries.filter(Boolean))];
      const curSObj =
        !isMovie && sNum > 1
          ? (item.seasons || []).find((s) => s.season_number === sNum)
          : null;
      const sAirDate =
        !isMovie && sNum > 1
          ? curSObj?.air_date
          : item.first_air_date || item.release_date || null;
      const targetYear =
        (sAirDate ? parseInt(sAirDate.substring(0, 4), 10) : null) ||
        parseInt(this.getItemYear(item), 10) ||
        null;
      const targetMonth = sAirDate
        ? parseInt(sAirDate.substring(5, 7), 10)
        : null;
      const norm = (s) =>
        (s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const targetNorms = new Set();
      const roman = {
        2: "II",
        3: "III",
        4: "IV",
        5: "V",
        6: "VI",
        7: "VII",
        8: "VIII",
      };
      if (!isMovie && sNum > 1) {
        if (curSObj?.name) targetNorms.add(norm(curSObj.name));
        targetNorms.add(norm(`${baseTitle} Season ${sNum}`));
        targetNorms.add(norm(`${baseTitle} ${sNum}`));
        if (roman[sNum]) targetNorms.add(norm(`${baseTitle} ${roman[sNum]}`));
        if (romajiAlt) {
          targetNorms.add(norm(`${romajiAlt} Season ${sNum}`));
          targetNorms.add(norm(`${romajiAlt} ${sNum}`));
          if (roman[sNum]) targetNorms.add(norm(`${romajiAlt} ${roman[sNum]}`));
        }
      } else {
        [rawTitle, baseTitle, origTitle, romajiAlt]
          .filter(Boolean)
          .forEach((t) => targetNorms.add(norm(t)));
        const shortBase = baseTitle.split(/[:\-–—~]/)[0].trim();
        if (shortBase && shortBase !== baseTitle)
          targetNorms.add(norm(shortBase));
      }
      (
        item.alternative_titles?.results ||
        item.alternative_titles?.titles ||
        []
      ).forEach((alt) => {
        if (alt.title) targetNorms.add(norm(alt.title));
      });
      const targetNatives = new Set(
        [rawOrig, origTitle].filter(Boolean).map((s) => s.trim()),
      );
      const usedAniIds = new Set();
      if (!isMovie && sNum > 1) {
        const s1InfoCached = this.animeCache?.[`${item.id}_s1`];
        if (s1InfoCached?.aniId) usedAniIds.add(s1InfoCached.aniId);
        if (Array.isArray(s1InfoCached?.sequelChain)) {
          s1InfoCached.sequelChain.forEach((node) => {
            if (node?.id) usedAniIds.add(node.id);
          });
        }
        for (let prevS = 1; prevS < sNum; prevS++) {
          const prevCached = this.animeCache?.[`${item.id}_s${prevS}`];
          if (prevCached?.aniId) usedAniIds.add(prevCached.aniId);
        }
      }
      const queryAniList = async (searchStr, formats, allowLoose = false) => {
        try {
          const fmtParam =
            formats && formats.length
              ? `, format_in: [${formats.join(",")}]`
              : "";
          const query = `query ($s: String) { Page(page: 1, perPage: 10) { media(search: $s, sort: [SEARCH_MATCH, POPULARITY_DESC], type: ANIME${fmtParam}) { id idMal format status season seasonYear genres studios(isMain: true) { nodes { name isAnimationStudio } } startDate { year month day } title { romaji english native userPreferred } coverImage { extraLarge large } synonyms episodes relations { edges { relationType node { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes season seasonYear startDate { year month day } title { romaji english native userPreferred } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } } } } } } } } } }`;
          const d = await this.aniApi(query, { s: searchStr });
          const list = d?.data?.Page?.media || [];
          if (list.length === 0) return null;
          const filteredList =
            !isMovie && sNum > 1
              ? list.filter((m) => !usedAniIds.has(m.id))
              : list;
          if (filteredList.length === 0) return null;
          const scored = filteredList.map((m) => {
            const mNorms = [
              m.title?.english,
              m.title?.romaji,
              m.title?.userPreferred,
              ...(m.synonyms || []),
            ]
              .filter(Boolean)
              .map(norm);
            const mNative = (m.title?.native || "").trim();
            const cleanJp = (s) =>
              (s || "").replace(/[\s\u3000\p{P}\p{S}]/gu, "").toLowerCase();
            const mNativeClean = cleanJp(mNative);
            const mYear = m.startDate?.year || m.seasonYear || null;
            const mMonth = m.startDate?.month || null;
            const fmtMatches = formats
              ? formats.includes(m.format)
              : isMovie
                ? m.format === "MOVIE" || m.format === "SPECIAL"
                : ["TV", "TV_SHORT", "ONA"].includes(m.format);
            const hasExactNative = Boolean(
              mNativeClean &&
              [...targetNatives].some((tn) => cleanJp(tn) === mNativeClean),
            );
            const hasExactNorm = mNorms.some((n) => n && targetNorms.has(n));
            const hasExactTitle = hasExactNative || hasExactNorm;
            const yearDiff =
              targetYear && mYear ? Math.abs(targetYear - mYear) : null;
            let dateScore = 0;
            if (yearDiff === 0) {
              if (targetMonth && mMonth) {
                const mDiff = Math.abs(targetMonth - mMonth);
                if (mDiff <= 1) dateScore = 3;
                else if (
                  (targetMonth >= 1 &&
                    targetMonth <= 3 &&
                    mMonth >= 1 &&
                    mMonth <= 3) ||
                  (targetMonth >= 4 &&
                    targetMonth <= 6 &&
                    mMonth >= 4 &&
                    mMonth <= 6) ||
                  (targetMonth >= 7 &&
                    targetMonth <= 9 &&
                    mMonth >= 7 &&
                    mMonth <= 9) ||
                  (targetMonth >= 10 &&
                    targetMonth <= 12 &&
                    mMonth >= 10 &&
                    mMonth <= 12)
                )
                  dateScore = 2;
                else dateScore = 1;
              } else {
                dateScore = 2;
              }
            } else if (yearDiff === 1) {
              if (targetMonth && mMonth) {
                const totalT = targetYear * 12 + targetMonth;
                const totalM = mYear * 12 + mMonth;
                if (Math.abs(totalT - totalM) <= 2) dateScore = 1;
              }
            }
            const hasTvPrequel =
              !isMovie &&
              sNum <= 1 &&
              !(hasExactTitle && yearDiff !== null && yearDiff <= 1) &&
              (m.relations?.edges || []).some(
                (e) =>
                  (e.relationType === "PREQUEL" ||
                    e.relationType === "PARENT") &&
                  ["TV", "TV_SHORT", "ONA"].includes(e.node?.format),
              );
            const isSeasonSequel =
              !isMovie &&
              sNum <= 1 &&
              !(hasExactTitle && yearDiff !== null && yearDiff <= 1) &&
              (this.isAnimeSeasonSequel(
                m.title?.english || m.title?.romaji || m.title?.userPreferred,
              ) ||
                hasTvPrequel);
            const hasLineagePrequel =
              !isMovie &&
              sNum > 1 &&
              (m.relations?.edges || []).some(
                (e) =>
                  (e.relationType === "PREQUEL" ||
                    e.relationType === "PARENT") &&
                  usedAniIds.has(e.node?.id),
              );
            const hasPunctuationMatch =
              !isMovie &&
              sNum > 1 &&
              Boolean(
                norm(baseTitle) &&
                mNorms.includes(norm(baseTitle)) &&
                (dateScore >= 1 || yearDiff === 0),
              );
            let score = 0;
            if (fmtMatches) score += 50;
            if (hasLineagePrequel) score += 100;
            if (hasExactTitle) score += 40;
            if (hasExactNative) score += 20;
            if (hasPunctuationMatch && !hasExactTitle) score += 35;
            score += dateScore * 15;
            if (isSeasonSequel) score -= 150;
            if (yearDiff !== null && yearDiff > 3) score -= 50;
            return { m, score, fmtMatches, yearDiff, hasExactTitle };
          });
          scored.sort((a, b) => b.score - a.score);
          if (scored.length > 0 && scored[0].score >= 45) return scored[0].m;
          if (allowLoose) {
            const hitLoose = scored.find(
              (x) => x.fmtMatches && (x.yearDiff === null || x.yearDiff <= 1),
            );
            if (hitLoose) return hitLoose.m;
          }
          return null;
        } catch (e) {
          return null;
        }
      };
      let aniId = null;
      let malId = null;
      let romajiTitle = "";
      const isSpecialSeason = Boolean(
        curSObj?.name &&
        /^(?:ova|special|specials|extra|extras)\b/i.test(curSObj.name),
      );
      const targetFormats = isMovie
        ? ["MOVIE", "SPECIAL"]
        : isSpecialSeason
          ? ["OVA", "SPECIAL"]
          : ["TV", "TV_SHORT", "ONA"];
      let media = null;
      if (!forceFresh && sNum <= 1 && item?.ani_id) {
        const preCached =
          this.animeCache?.[`ani_${item.ani_id}`] ||
          this.animeCache?.[String(item.ani_id)];
        if (
          preCached &&
          (preCached.episodes || preCached.episodes === 0) &&
          Array.isArray(preCached.sequelChain) &&
          preCached.sequelChain.length > 1 &&
          Array.isArray(preCached.relations?.edges)
        ) {
          media = {
            id: preCached.aniId || item.ani_id,
            idMal: preCached.malId || item.ani_id,
            format: preCached.animeFormat,
            status: "FINISHED",
            season: preCached.season,
            seasonYear: preCached.seasonYear,
            episodes: preCached.episodes,
            genres: preCached.genres || [],
            studios: {
              nodes: (preCached.studios || []).map((name) => ({
                name,
                isAnimationStudio: true,
              })),
            },
            startDate: { year: preCached.seasonYear },
            title: { romaji: preCached.romaji || "" },
            relations: preCached.relations,
          };
        }
      }
      if (!media && sNum <= 1 && item?.ani_id) {
        try {
          const aRes = await this.aniApi(this.ANI_MEDIA_QUERY, {
            id: Number(item.ani_id),
          });
          if (aRes?.data?.Media) media = aRes.data.Media;
        } catch (e) {}
      }
      if (!media) {
        for (const qStr of searchQueries) {
          media = await queryAniList(qStr, targetFormats, false);
          if (media) break;
        }
        if (!media) {
          for (const qStr of searchQueries) {
            media = await queryAniList(qStr, null, false);
            if (media) break;
          }
        }
        if (!media) {
          for (const qStr of searchQueries) {
            media = await queryAniList(qStr, targetFormats, true);
            if (media) break;
          }
        }
      }
      let sequelChain = [];
      const studioSet = new Set();
      if (media) {
        aniId = media.id;
        malId = media.idMal || media.id;
        if (media.format) animeFormat = media.format;
        if (media.title?.romaji) romajiTitle = media.title.romaji;
        (media.studios?.nodes || []).forEach((st) => {
          if (st?.name && st.isAnimationStudio) studioSet.add(st.name);
        });
        if (!isMovie) {
          const parseSeasonNum = (titleObj, prevS) => {
            const full = [
              titleObj?.english,
              titleObj?.romaji,
              titleObj?.userPreferred,
            ]
              .filter(Boolean)
              .join(" ");
            const sM = full.match(/(?:season|series)\s*(\d+)/i);
            if (sM) return parseInt(sM[1], 10);
            const ordM = full.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
            if (ordM) return parseInt(ordM[1], 10);
            const romM = full.match(/\b(II|III|IV|V|VI|VII|VIII|IX)\b/);
            if (romM) {
              const rMap = {
                II: 2,
                III: 3,
                IV: 4,
                V: 5,
                VI: 6,
                VII: 7,
                VIII: 8,
                IX: 9,
              };
              if (rMap[romM[1]]) return rMap[romM[1]];
            }
            const isPartOrCour =
              /\b(?:part\s*[2-9]|cour\s*[2-9]|[2-9](?:nd|rd|th)\s*cour)\b/i.test(
                full,
              );
            if (isPartOrCour) return prevS;
            return prevS + 1;
          };
          let curSeasonNum = 1;
          sequelChain.push({
            id: media.id,
            idMal: media.idMal || media.id,
            episodes: media.episodes,
            format: media.format,
            season: curSeasonNum,
            broadcastSeason:
              media.season || this.resolveAnimeSeason(media) || null,
            startDate: media.startDate,
            title: media.title,
            poster_path:
              this.getAniCover(media.coverImage) ||
              this.animeCache?.[`ani_${media.id}`]?.poster_path ||
              "",
          });
          if (!(media.status === "RELEASING" && !media.episodes)) {
            const queue = [{ node: media, bridgeDepth: 0 }];
            const visited = new Set([media.id]);
            let steps = 0;
            const validTmdbS = !isMovie
              ? (item.seasons || []).filter((s) => this.isSeasonAired(s))
              : [];
            const s0EpCount = !isMovie
              ? (item.seasons || []).find((s) => s.season_number === 0)
                  ?.episode_count || 0
              : 0;
            const tmdbEpLimit =
              !isMovie && sNum <= 1
                ? validTmdbS.reduce(
                    (sum, s) => sum + (s.episode_count || 0),
                    0,
                  ) + (s0EpCount > 0 ? 15 : 0) ||
                  item.number_of_episodes ||
                  null
                : null;
            while (queue.length > 0 && steps < 20) {
              const currentChainEps = sequelChain.reduce(
                (sum, e) =>
                  sum +
                  (e._isSpecial || e.format === "MOVIE" ? 0 : e.episodes || 0),
                0,
              );
              if (
                tmdbEpLimit &&
                currentChainEps >= tmdbEpLimit &&
                !queue.some((q) => q.bridgeDepth > 0)
              )
                break;
              steps++;
              const current = queue.shift();
              const cMed = current.node;
              const bDepth = current.bridgeDepth;
              let edges = cMed.relations?.edges || [];
              if (edges.length === 0 && steps === 1) {
                try {
                  const rQ = `query ($mId: Int) { Media(id: $mId) { id idMal format status episodes startDate { year month day } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } } } } } }`;
                  const rD = await this.aniApi(rQ, { mId: cMed.id });
                  if (rD?.data?.Media?.relations?.edges)
                    edges = rD.data.Media.relations.edges;
                } catch (e) {}
              }
              const tvSequels = edges.filter(
                (e) =>
                  e.relationType === "SEQUEL" &&
                  ["TV", "TV_SHORT", "ONA"].includes(e.node?.format) &&
                  !visited.has(e.node?.id),
              );
              if (tvSequels.length > 0) {
                tvSequels.sort(
                  (a, b) =>
                    (a.node?.startDate?.year || 0) -
                    (b.node?.startDate?.year || 0),
                );
                for (const sEdge of tvSequels) {
                  const sNode = sEdge.node;
                  visited.add(sNode.id);
                  if (sNode.status === "CANCELLED") continue;
                  if (sNode.status === "NOT_YET_RELEASED") {
                    if (sNode.startDate?.year) {
                      const sDate = new Date(
                        sNode.startDate.year,
                        (sNode.startDate.month || 1) - 1,
                        sNode.startDate.day || 1,
                      );
                      if (sDate.getFullYear() > new Date().getFullYear() + 2)
                        continue;
                    }
                  }
                  curSeasonNum = parseSeasonNum(sNode.title, curSeasonNum);
                  const chainEntry = {
                    id: sNode.id,
                    idMal: sNode.idMal || sNode.id,
                    episodes: sNode.episodes || 12,
                    format: sNode.format,
                    season: curSeasonNum,
                    broadcastSeason:
                      sNode.season || this.resolveAnimeSeason(sNode) || null,
                    startDate: sNode.startDate,
                    title: sNode.title,
                    poster_path:
                      this.getAniCover(sNode.coverImage) ||
                      this.animeCache?.[`ani_${sNode.id}`]?.poster_path ||
                      "",
                  };
                  sequelChain.push(chainEntry);
                  if (sNode.relations?.edges?.length > 0) {
                    (sNode.studios?.nodes || []).forEach((st) => {
                      if (st?.name && st.isAnimationStudio)
                        studioSet.add(st.name);
                    });
                    queue.push({ node: sNode, bridgeDepth: 0 });
                  } else {
                    try {
                      const rQuery = `query ($mId: Int) { Media(id: $mId) { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes startDate { year month day } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } } } } } } } } }`;
                      const rData = await this.aniApi(rQuery, {
                        mId: sNode.id,
                      });
                      const fullNode = rData?.data?.Media;
                      if (fullNode) {
                        if (fullNode.episodes)
                          chainEntry.episodes = fullNode.episodes;
                        if (fullNode.startDate)
                          chainEntry.startDate = fullNode.startDate;
                        if (!chainEntry.poster_path && fullNode.coverImage)
                          chainEntry.poster_path =
                            this.getAniCover(fullNode.coverImage) || "";
                        (fullNode.studios?.nodes || []).forEach((st) => {
                          if (st?.name && st.isAnimationStudio)
                            studioSet.add(st.name);
                        });
                        queue.push({ node: fullNode, bridgeDepth: 0 });
                      } else {
                        queue.push({ node: sNode, bridgeDepth: 0 });
                      }
                    } catch (e) {
                      queue.push({ node: sNode, bridgeDepth: 0 });
                    }
                  }
                }
              } else {
                if (bDepth < 4) {
                  const bridgeSequels = edges.filter(
                    (e) =>
                      e.relationType === "SEQUEL" &&
                      ["OVA", "SPECIAL", "MOVIE", "ONA"].includes(
                        e.node?.format,
                      ) &&
                      !visited.has(e.node?.id),
                  );
                  bridgeSequels.sort(
                    (a, b) =>
                      (a.node?.startDate?.year || 0) -
                      (b.node?.startDate?.year || 0),
                  );
                  for (const bEdge of bridgeSequels) {
                    const bNode = bEdge.node;
                    visited.add(bNode.id);
                    if (
                      bNode.status === "CANCELLED" ||
                      bNode.status === "NOT_YET_RELEASED"
                    )
                      continue;
                    let bEntry = null;
                    if (
                      ["SPECIAL", "OVA", "ONA"].includes(bNode.format) &&
                      bNode.format !== "MOVIE" &&
                      s0EpCount > 0
                    ) {
                      bEntry = {
                        id: bNode.id,
                        idMal: bNode.idMal || bNode.id,
                        hasExplicitMal: Boolean(
                          bNode.idMal && bNode.idMal !== bNode.id,
                        ),
                        episodes: bNode.episodes || 1,
                        format: bNode.format,
                        season: curSeasonNum,
                        broadcastSeason:
                          bNode.season ||
                          this.resolveAnimeSeason(bNode) ||
                          null,
                        startDate: bNode.startDate,
                        title: bNode.title,
                        poster_path:
                          this.getAniCover(bNode.coverImage) ||
                          this.animeCache?.[`ani_${bNode.id}`]?.poster_path ||
                          "",
                        _isSpecial: true,
                      };
                      sequelChain.push(bEntry);
                    }
                    try {
                      const rQuery = `query ($mId: Int) { Media(id: $mId) { id idMal format status episodes startDate { year month day } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } } } } } }`;
                      const rData = await this.aniApi(rQuery, {
                        mId: bNode.id,
                      });
                      const fullB = rData?.data?.Media;
                      if (fullB) {
                        if (bEntry) {
                          if (fullB.idMal) {
                            bEntry.idMal = fullB.idMal;
                            bEntry.hasExplicitMal = fullB.idMal !== bEntry.id;
                          }
                          if (fullB.episodes) bEntry.episodes = fullB.episodes;
                          if (fullB.startDate)
                            bEntry.startDate = fullB.startDate;
                          if (!bEntry.poster_path && fullB.coverImage)
                            bEntry.poster_path =
                              this.getAniCover(fullB.coverImage) || "";
                        }
                        queue.push({ node: fullB, bridgeDepth: bDepth + 1 });
                      }
                    } catch (e) {}
                  }
                }
                if (queue.length === 0 && sequelChain.length <= 1) {
                  const altEdges = edges.filter(
                    (e) =>
                      (e.relationType === "ALTERNATIVE" ||
                        e.relationType === "SIDE_STORY") &&
                      ["TV", "TV_SHORT", "ONA"].includes(e.node?.format) &&
                      (e.node?.episodes === null || e.node?.episodes >= 10) &&
                      !visited.has(e.node?.id),
                  );
                  altEdges.sort(
                    (a, b) =>
                      (a.node?.startDate?.year || 0) -
                      (b.node?.startDate?.year || 0),
                  );
                  for (const aEdge of altEdges) {
                    const aNode = aEdge.node;
                    visited.add(aNode.id);
                    curSeasonNum = parseSeasonNum(aNode.title, curSeasonNum);
                    const chainEntry = {
                      id: aNode.id,
                      idMal: aNode.idMal || aNode.id,
                      episodes: aNode.episodes,
                      format: aNode.format,
                      season: curSeasonNum,
                      broadcastSeason:
                        aNode.season || this.resolveAnimeSeason(aNode) || null,
                      startDate: aNode.startDate,
                      title: aNode.title,
                      poster_path:
                        this.getAniCover(aNode.coverImage) ||
                        this.animeCache?.[`ani_${aNode.id}`]?.poster_path ||
                        "",
                    };
                    sequelChain.push(chainEntry);
                    try {
                      const rQuery = `query ($mId: Int) { Media(id: $mId) { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes startDate { year month day } coverImage { extraLarge large } relations { edges { relationType node { id idMal format status studios(isMain: true) { nodes { name isAnimationStudio } } episodes season seasonYear startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large } } } } } }`;
                      const rData = await this.aniApi(rQuery, {
                        mId: aNode.id,
                      });
                      const fullNode = rData?.data?.Media;
                      if (fullNode) {
                        if (fullNode.episodes)
                          chainEntry.episodes = fullNode.episodes;
                        if (fullNode.startDate)
                          chainEntry.startDate = fullNode.startDate;
                        if (!chainEntry.poster_path && fullNode.coverImage)
                          chainEntry.poster_path =
                            this.getAniCover(fullNode.coverImage) || "";
                        (fullNode.studios?.nodes || []).forEach((st) => {
                          if (st?.name && st.isAnimationStudio)
                            studioSet.add(st.name);
                        });
                      }
                    } catch (e) {}
                  }
                }
              }
            }
          }
        }
      }
      if (
        sequelChain.length > 1 &&
        sequelChain.every((e) => (e.season || 1) === 1)
      ) {
        sequelChain.forEach((e, idx) => {
          e.season = idx + 1;
        });
      }
      if (!malId) {
        const malKey = this.getMalKey();
        if (malKey) {
          for (const qStr of searchQueries) {
            try {
              const malTarget = `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(qStr)}&limit=1`;
              const mRes = await fetch(malTarget, {
                headers: { "X-MAL-CLIENT-ID": malKey },
              });
              const mData = await mRes.json();
              if (mData?.data?.[0]?.node?.id) {
                malId = mData.data[0].node.id;
                if (!aniId) aniId = malId;
                break;
              }
            } catch (err) {}
          }
        }
      }
      if (!isMovie && sNum > 1 && !aniId && !malId) {
        const s1Key = `${item.id}_s1`;
        const s1 =
          this.animeCache[s1Key] || (await this.fetchAnimeInfo(item, 1));
        if (s1) {
          const validS = (item.seasons || []).filter((s) =>
            this.isSeasonAired(s),
          );
          const tIdx = validS.findIndex((s) => s.season_number === sNum);
          let epOff = 0;
          if (tIdx > 0 && validS.length > 1) {
            for (let i = 1; i <= tIdx; i++)
              epOff += validS[i - 1].episode_count || 0;
          }
          const resInfo = {
            ...s1,
            epOffset: epOff,
            sequelChain: s1.sequelChain || [
              { id: s1.aniId, idMal: s1.malId, season: 1 },
            ],
          };
          this.animeCache[cacheKey] = resInfo;
          this.persistCache("anime");
          return resInfo;
        }
      }
      if (aniId || malId) {
        const animeSeason = this.resolveAnimeSeason(media);
        const studiosArr =
          studioSet.size > 0
            ? Array.from(studioSet)
            : this.animeCache[cacheKey]?.studios || [];
        const info = {
          ...this.animeCache[cacheKey],
          aniId: aniId || malId,
          malId: malId || aniId,
          animeFormat: animeFormat,
          romaji:
            romajiTitle ||
            this.animeCache[cacheKey]?.romaji ||
            this.animeCache[String(item.id)]?.romaji ||
            "",
          native:
            media?.title?.native || this.animeCache[cacheKey]?.native || "",
          season: animeSeason,
          seasonYear: media?.seasonYear || media?.startDate?.year || null,
          genres: media?.genres || this.animeCache[cacheKey]?.genres || [],
          studios: studiosArr,
          trailer: media?.trailer || null,
          sequelChain: sequelChain,
          _chainComplete: true,
        };
        const validSeasons = (item.seasons || []).filter((s) =>
          this.isSeasonAired(s),
        );
        if (
          validSeasons.length > 1 &&
          sequelChain.length > validSeasons.length
        ) {
          info.hybridSeasonList = this.buildHybridSeasonList(
            validSeasons,
            sequelChain,
            item,
          );
        }
        this.animeCache[cacheKey] = info;
        this.animeCache[String(item.id)] = {
          ...this.animeCache[String(item.id)],
          ...info,
        };
        this.persistCache("anime");
        return info;
      }
      return null;
    });
  },
  fetchAnimeParentLogo: async function (anilistMedia, fallbackTitle = "") {
    if (!anilistMedia && !fallbackTitle) return null;
    const aniId = anilistMedia?.id || anilistMedia?.ani_id;
    const cacheKey = aniId ? `ani_${aniId}_parent_logo` : null;
    if (!this.animeCache) this.animeCache = {};
    if (cacheKey && this.animeCache[cacheKey]) return this.animeCache[cacheKey];
    const cleanAnimeTitle = (s) =>
      (s || "")
        .replace(
          /\s*[:\-–—~]?\s*\((?:tv|tv\s+series|ona|ova|special|specials|web)\)\s*$/i,
          "",
        )
        .replace(/\s*\b(?:tv|ona|ova)\b\s*$/i, "")
        .trim();
    const getBase = (s) =>
      cleanAnimeTitle(s)
        .split(/[:\-–—~]/)[0]
        .replace(
          /\b(?:season\s*\d+|\d+(?:st|nd|rd|th)\s+season|part\s*\d+|cour\s*\d+|new\s+world|stone\s+wars|eternal\s+summer|dive\s+to\s+the\s+future|thousand\s*year\s*blood\s*war).*$/i,
          "",
        )
        .trim();
    const candidateQueries = [];
    const relations = anilistMedia?.relations?.edges || [];
    const parentEdges = relations.filter(
      (e) =>
        ["PARENT", "PREQUEL", "SOURCE", "SIDE_STORY", "ALTERNATIVE"].includes(
          e.relationType,
        ) &&
        (e.node?.format === "TV" ||
          e.node?.format === "TV_SHORT" ||
          e.node?.format === "MOVIE"),
    );
    parentEdges.sort((a, b) => {
      const score = (r) => (r === "PARENT" ? 3 : r === "PREQUEL" ? 2 : 1);
      return score(b.relationType) - score(a.relationType);
    });
    for (const edge of parentEdges) {
      const nt = edge.node?.title;
      if (nt) {
        [nt.english, nt.romaji, nt.userPreferred]
          .filter(Boolean)
          .forEach((t) => {
            if (!candidateQueries.includes(t)) candidateQueries.push(t);
          });
      }
    }
    const rawTitles = [
      anilistMedia?.title?.english,
      anilistMedia?.title?.romaji,
      anilistMedia?.title?.userPreferred,
      fallbackTitle,
    ].filter(Boolean);
    for (const rt of rawTitles) {
      const base = getBase(rt);
      if (base && base.length >= 2 && !candidateQueries.includes(base))
        candidateQueries.push(base);
      const cleaned = cleanAnimeTitle(rt);
      if (cleaned && cleaned.length >= 2 && !candidateQueries.includes(cleaned))
        candidateQueries.push(cleaned);
    }
    for (const q of candidateQueries) {
      try {
        let sRes = await this.api(
          "/search/tv",
          { query: q },
          this.getTmdbAnimeKey(),
        );
        let mediaType = "tv";
        let hits = (sRes?.results || []).filter((h) => this.isAnimeItem(h));
        if (hits.length === 0) {
          sRes = await this.api(
            "/search/movie",
            { query: q },
            this.getTmdbAnimeKey(),
          );
          hits = (sRes?.results || []).filter((h) => this.isAnimeItem(h));
          mediaType = "movie";
        }
        if (hits.length === 0) continue;
        const hit = hits[0];
        const imgRes = await this.api(
          `/${mediaType}/${hit.id}/images`,
          { include_image_language: "en,null,ja" },
          this.getTmdbAnimeKey(),
        );
        const logos = imgRes?.logos || [];
        const chosenLogo =
          logos.find((l) => l.iso_639_1 === "en") ||
          logos.find((l) => !l.iso_639_1) ||
          logos.find((l) => l.iso_639_1 === "ja") ||
          logos[0];
        if (chosenLogo && chosenLogo.file_path) {
          if (cacheKey) {
            this.animeCache[cacheKey] = chosenLogo;
            this.persistCache("anime");
          }
          return chosenLogo;
        }
      } catch (e) {}
    }
    return null;
  },
  resolveAnimeSequelEp: function (epNum, sequelChain) {
    const parsed = parseInt(epNum, 10);
    let rem = isNaN(parsed) ? 1 : parsed,
      curS = 1,
      offset = 0;
    if (!sequelChain || sequelChain.length <= 1)
      return { season: 1, ep: rem, rem: rem, entry: sequelChain?.[0] || null };
    if (rem === 0) return { season: 1, ep: 0, rem: 0, entry: sequelChain[0] };
    for (let i = 0; i < sequelChain.length; i++) {
      const entry = sequelChain[i];
      if (entry._isSpecial || entry.format === "MOVIE") continue;
      const entryS = entry.season || curS + 1;
      if (entryS !== curS) {
        curS = entryS;
        offset = 0;
      }
      const epCount =
        entry.episodes || (i < sequelChain.length - 1 ? 12 : null);
      if (i === sequelChain.length - 1 || !epCount || rem <= epCount) {
        return { season: curS, ep: offset + rem, rem: rem, entry: entry };
      }
      rem -= epCount;
      offset += epCount;
    }
    return { season: curS, ep: offset + rem, rem: rem, entry: null };
  },
  buildHybridSeasonList: function (validSeasons, sequelChain, data) {
    if (
      !Array.isArray(validSeasons) ||
      validSeasons.length <= 1 ||
      !Array.isArray(sequelChain) ||
      sequelChain.length <= validSeasons.length
    )
      return null;
    const out = [];
    let cIdx = 0,
      virtNum = 1,
      lastTvSeasonNum = null;
    const baseTitle = (data?.name || data?.title || "").trim();
    const hasS0 = (data?.seasons || []).some(
      (s) => s.season_number === 0 && (s.episode_count || 0) > 0,
    );
    const cleanSubTitle = (raw, fallback) => {
      if (!raw) return fallback;
      let s = String(raw).trim();
      if (baseTitle && s.toLowerCase().startsWith(baseTitle.toLowerCase())) {
        const rest = s
          .slice(baseTitle.length)
          .replace(/^[\s:\-–—~*]+/, "")
          .trim();
        if (!rest) return fallback;
        if (rest.length >= 3) return rest;
      }
      const sMatch = s.match(/(?:season|series)\s*(\d+)/i);
      if (sMatch) return `Season ${sMatch[1]}`;
      return s;
    };
    const emitSpecialsAtCursor = () => {
      while (
        cIdx < sequelChain.length &&
        sequelChain[cIdx]?.format === "MOVIE"
      ) {
        cIdx++;
      }
      const spGroup = [];
      while (
        cIdx < sequelChain.length &&
        (sequelChain[cIdx]?._isSpecial || sequelChain[cIdx]?.format === "MOVIE")
      ) {
        if (sequelChain[cIdx]?.format !== "MOVIE") {
          spGroup.push(sequelChain[cIdx]);
        }
        cIdx++;
      }
      if (spGroup.length > 0 && hasS0) {
        const firstSp = spGroup[0];
        const rawSpT =
          firstSp.title?.english ||
          firstSp.title?.romaji ||
          firstSp.title?.userPreferred ||
          "OVA";
        let defaultLabel = lastTvSeasonNum
          ? `Season ${lastTvSeasonNum} OVA`
          : "OVA";
        let spCardName = cleanSubTitle(rawSpT, defaultLabel);
        if (
          (!spCardName || spCardName.toLowerCase() === "ova") &&
          lastTvSeasonNum
        ) {
          spCardName = `Season ${lastTvSeasonNum} OVA`;
        }
        if (spGroup.length > 1) {
          spCardName =
            spCardName
              .replace(
                /\s*[:\-–—]?\s*(?:part\s*1|zenpen|special\s*1|\(1\))\b.*$/i,
                "",
              )
              .trim() || spCardName;
        }
        const spDate = firstSp.startDate?.year
          ? `${firstSp.startDate.year}-${String(firstSp.startDate.month || 1).padStart(2, "0")}-${String(firstSp.startDate.day || 1).padStart(2, "0")}`
          : null;
        out.push({
          season_number: virtNum++,
          name: spCardName,
          poster_path: firstSp.poster_path || data?.poster_path || "",
          air_date: spDate,
          startDate: firstSp.startDate || null,
          broadcastSeason: firstSp.broadcastSeason || null,
          season: firstSp.broadcastSeason || null,
          seasonYear: firstSp.startDate?.year || null,
          episode_count: spGroup.reduce((sum, e) => sum + (e.episodes || 1), 0),
          _tmdbSeason: 0,
          _isSpecialGroup: true,
          _specialEntries: spGroup,
          _aniEntry: firstSp,
          _isHybridSplit: true,
        });
      }
    };
    for (let i = 0; i < validSeasons.length; i++) {
      emitSpecialsAtCursor();
      const vs = validSeasons[i];
      const tSNum = vs.season_number;
      lastTvSeasonNum = tSNum;
      const tEps = vs.episode_count || 0;
      while (
        cIdx < sequelChain.length &&
        sequelChain[cIdx]?.format === "MOVIE"
      ) {
        cIdx++;
      }
      const curEntry = sequelChain[cIdx];
      if (!curEntry) {
        out.push({
          ...vs,
          season_number: virtNum++,
          _tmdbSeason: tSNum,
          _epStart: 1,
          _epEnd: tEps,
          _aniEpOffset: 0,
          _aniEntry: null,
        });
        continue;
      }
      const firstEps = curEntry.episodes || 0;
      if (
        firstEps > 0 &&
        tEps > firstEps + 3 &&
        cIdx + 1 < sequelChain.length
      ) {
        let epCursor = 1;
        while (cIdx < sequelChain.length && epCursor <= tEps) {
          while (
            cIdx < sequelChain.length &&
            sequelChain[cIdx]?.format === "MOVIE"
          ) {
            cIdx++;
          }
          if (sequelChain[cIdx]?._isSpecial) {
            emitSpecialsAtCursor();
            continue;
          }
          const entry = sequelChain[cIdx];
          const cEps = entry.episodes || 12;
          if (epCursor > 1 && i + 1 < validSeasons.length) {
            const nextVsYr = parseInt(
              (validSeasons[i + 1].air_date || "").substring(0, 4),
              10,
            );
            const entryYr = entry.startDate?.year || null;
            if (
              nextVsYr &&
              entryYr &&
              entryYr >= nextVsYr &&
              epCursor + cEps - 1 > tEps + 2
            )
              break;
          }
          const epStart = epCursor;
          const epEnd = Math.min(tEps, epCursor + cEps - 1);
          const rawT =
            entry.title?.english ||
            entry.title?.romaji ||
            entry.title?.userPreferred ||
            vs.name;
          const cardName = cleanSubTitle(rawT, vs.name);
          const entryDate = entry.startDate?.year
            ? `${entry.startDate.year}-${String(entry.startDate.month || 1).padStart(2, "0")}-${String(entry.startDate.day || 1).padStart(2, "0")}`
            : epStart === 1
              ? vs.air_date
              : null;
          out.push({
            ...vs,
            season_number: virtNum++,
            name: cardName,
            poster_path: entry.poster_path || vs.poster_path || "",
            air_date: entryDate,
            startDate: entry.startDate || null,
            broadcastSeason: entry.broadcastSeason || null,
            season: entry.broadcastSeason || null,
            seasonYear: entry.startDate?.year || null,
            episode_count: epEnd - epStart + 1,
            _tmdbSeason: tSNum,
            _epStart: epStart,
            _epEnd: epEnd,
            _aniEpOffset: 0,
            _aniEntry: entry,
            _isHybridSplit: true,
          });
          epCursor = epEnd + 1;
          cIdx++;
        }
      } else if (firstEps > 0 && tEps < firstEps - 3) {
        let usedEps = 0;
        while (i < validSeasons.length) {
          const subVs = validSeasons[i];
          const subTEps = subVs.episode_count || 0;
          out.push({
            ...subVs,
            season_number: virtNum++,
            _tmdbSeason: subVs.season_number,
            _epStart: 1,
            _epEnd: subTEps,
            _aniEpOffset: usedEps,
            _aniEntry: curEntry,
            _isHybridSplit: true,
          });
          usedEps += subTEps;
          if (usedEps >= firstEps - 2 || i + 1 >= validSeasons.length) break;
          i++;
        }
        cIdx++;
      } else {
        out.push({
          ...vs,
          season_number: virtNum++,
          poster_path: curEntry.poster_path || vs.poster_path || "",
          startDate: curEntry.startDate || null,
          broadcastSeason: curEntry.broadcastSeason || null,
          seasonYear: curEntry.startDate?.year || null,
          _tmdbSeason: tSNum,
          _epStart: 1,
          _epEnd: tEps,
          _aniEpOffset: 0,
          _aniEntry: curEntry,
          _isHybridSplit: true,
        });
        cIdx++;
      }
    }
    const remSpecials = sequelChain
      .slice(cIdx)
      .filter(
        (e) =>
          e &&
          e.format !== "MOVIE" &&
          (e._isSpecial ||
            e.format === "SPECIAL" ||
            e.format === "OVA" ||
            e.format === "ONA"),
      );
    if (remSpecials.length > 0 && hasS0) {
      const firstSpec = remSpecials[0];
      const rawT =
        firstSpec.title?.english ||
        firstSpec.title?.romaji ||
        firstSpec.title?.userPreferred ||
        "Specials";
      let defaultLabel = lastTvSeasonNum
        ? `Season ${lastTvSeasonNum} OVA`
        : "Specials";
      let cardName = cleanSubTitle(rawT, defaultLabel);
      if (
        (!cardName ||
          cardName.toLowerCase() === "ova" ||
          cardName.toLowerCase() === "specials") &&
        lastTvSeasonNum
      ) {
        cardName = `Season ${lastTvSeasonNum} OVA`;
      }
      if (remSpecials.length > 1) {
        cardName =
          cardName
            .replace(
              /\s*[:\-–—]?\s*(?:part\s*1|zenpen|special\s*1|\(1\))\b.*$/i,
              "",
            )
            .trim() || cardName;
      }
      const entryDate = firstSpec.startDate?.year
        ? `${firstSpec.startDate.year}-${String(firstSpec.startDate.month || 1).padStart(2, "0")}-${String(firstSpec.startDate.day || 1).padStart(2, "0")}`
        : null;
      out.push({
        season_number: virtNum++,
        name: cardName,
        poster_path: firstSpec.poster_path || data?.poster_path || "",
        air_date: entryDate,
        startDate: firstSpec.startDate || null,
        broadcastSeason: firstSpec.broadcastSeason || null,
        season: firstSpec.broadcastSeason || null,
        seasonYear: firstSpec.startDate?.year || null,
        episode_count: remSpecials.reduce(
          (sum, e) => sum + (e.episodes || 1),
          0,
        ),
        _tmdbSeason: 0,
        _isSpecialGroup: true,
        _specialEntries: remSpecials,
        _aniEntry: firstSpec,
        _isHybridSplit: true,
      });
    }
    return out.some((s) => s._isHybridSplit) ? out : null;
  },
  resolveSpecialGroupEps: function (
    s0Episodes,
    specialEntries,
    groupSeasonNum = 1,
  ) {
    if (!Array.isArray(specialEntries) || specialEntries.length === 0)
      return [];
    const allEps = Array.isArray(s0Episodes) ? s0Episodes : [];
    const matched = [];
    const usedEpNums = new Set();
    specialEntries.forEach((entry, entryIdx) => {
      const count =
        specialEntries.length > 1 &&
        entry.episodes &&
        entry.episodes === specialEntries.length
          ? 1
          : entry.episodes || 1;
      const sy = entry.startDate?.year;
      const sm = entry.startDate?.month || 1;
      const sd = entry.startDate?.day || 1;
      const targetTime = sy ? Date.UTC(sy, sm - 1, sd) : null;
      let entryMatches = [];
      if (targetTime) {
        const windowDays = count > 1 ? 365 : 90;
        const candidates = allEps.filter((ep) => {
          if (!ep.air_date || usedEpNums.has(ep.episode_number)) return false;
          const epTime = Date.parse(ep.air_date);
          if (isNaN(epTime)) return false;
          return Math.abs(epTime - targetTime) <= windowDays * 86400000;
        });
        candidates.sort(
          (a, b) =>
            Math.abs(Date.parse(a.air_date) - targetTime) -
            Math.abs(Date.parse(b.air_date) - targetTime),
        );
        entryMatches = candidates.slice(0, count);
        entryMatches.sort((a, b) => a.episode_number - b.episode_number);
      }
      if (entryMatches.length === 0) {
        const normTitles = [
          entry.title?.english,
          entry.title?.romaji,
          entry.title?.userPreferred,
        ]
          .filter(Boolean)
          .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
          .filter((t) => t.length >= 3);
        if (normTitles.length > 0) {
          const textCandidates = allEps.filter((ep) => {
            if (usedEpNums.has(ep.episode_number) || !ep.name) return false;
            const epN = ep.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            return normTitles.some(
              (nt) => epN.includes(nt) || nt.includes(epN),
            );
          });
          entryMatches = textCandidates.slice(0, count);
          entryMatches.sort((a, b) => a.episode_number - b.episode_number);
        }
      }
      const isComplete = entryMatches.length >= count;
      if (isComplete) {
        entryMatches.forEach((ep, idx) => {
          usedEpNums.add(ep.episode_number);
          matched.push({
            ...ep,
            _aniEntry: entry,
            _aniEp: idx + 1,
            _relEp: matched.length + 1,
          });
        });
      } else {
        const fallbackDate = sy
          ? `${sy}-${String(sm).padStart(2, "0")}-${String(sd).padStart(2, "0")}`
          : "";
        const eTitle =
          entry.title?.english ||
          entry.title?.romaji ||
          entry.title?.userPreferred ||
          "Special";
        for (let i = 0; i < count; i++) {
          const synthNum =
            9000 + groupSeasonNum * 100 + entryIdx * 10 + (i + 1);
          matched.push({
            episode_number: synthNum,
            name: count > 1 ? `${eTitle} (${i + 1})` : eTitle,
            overview: "",
            still_path:
              entry.poster_path ||
              this.currentShow?.backdrop_path ||
              this.currentShow?.poster_path ||
              null,
            air_date: fallbackDate,
            _aniEntry: entry,
            _aniEp: i + 1,
            _relEp: matched.length + 1,
          });
        }
      }
    });
    return matched;
  },
  aniStaffRoleFilter: null,
  setAniStaffRole: function (role) {
    this.setRoleFilter("ani-staff", role);
  },
  buildAniExploreVars: function (
    f,
    type,
    isYearSortActive,
    sortOrder,
    page = 1,
    perPage = 35,
  ) {
    let aniSort = ["TRENDING_DESC", "POPULARITY_DESC"];
    if (isYearSortActive) {
      aniSort = sortOrder === "asc" ? ["START_DATE"] : ["START_DATE_DESC"];
    } else if (type === "popular" || type === "airing" || type === "specials") {
      aniSort = ["POPULARITY_DESC"];
    } else if (type === "newest") {
      aniSort = ["START_DATE_DESC"];
    }
    const isMovie = (f.t || this.exploreType) === "movie";
    const formatIn = isMovie
      ? ["MOVIE"]
      : type === "specials"
        ? ["SPECIAL", "OVA"]
        : ["TV", "TV_SHORT", "ONA"];
    const currentYear = new Date().getFullYear();
    const today = new Date();
    const todayInt =
      today.getFullYear() * 10000 +
      (today.getMonth() + 1) * 100 +
      today.getDate();
    const maxAllowedDate = (currentYear + 1) * 10000 + 1231;
    const gqlVars = {
      page: page,
      perPage: perPage,
      format_in: formatIn,
      sort: aniSort,
    };
    if (type === "airing") {
      gqlVars.status = "RELEASING";
    } else {
      gqlVars.status_not_in = ["CANCELLED", "NOT_YET_RELEASED"];
    }
    if (f.seasonIds.length === 1) gqlVars.season = f.seasonIds[0];
    if (f.genre2Ids.length > 0) gqlVars.genre_in = f.genre2Ids;
    if (f.aniTagIds.length > 0) gqlVars.tag_in = f.aniTagIds;
    if (f.countries.length === 1 && ["JP", "CN", "KR"].includes(f.countries[0]))
      gqlVars.countryOfOrigin = f.countries[0];
    if (f.years.length === 1) {
      gqlVars.seasonYear = parseInt(f.years[0], 10);
    } else if (f.years.length > 1) {
      const numYears = f.years.map(Number).filter((n) => !isNaN(n));
      const minY = Math.min(...numYears);
      const maxY = Math.max(...numYears);
      gqlVars.startDate_greater = (minY - 1) * 10000 + 1231;
      gqlVars.startDate_lesser = maxY * 10000 + 1231;
    } else if (type === "newest") {
      gqlVars.startDate_lesser = todayInt;
      gqlVars.startDate_greater = 19000101;
    } else if (isYearSortActive && sortOrder === "desc") {
      gqlVars.startDate_lesser = maxAllowedDate;
      gqlVars.startDate_greater = 19000101;
    } else if (isYearSortActive && sortOrder === "asc") {
      gqlVars.startDate_greater = 19000101;
      gqlVars.startDate_lesser = maxAllowedDate;
    }
    return { aniSort, gqlVars, formatIn };
  },
  similarSearch: null,
  similarSearchLoading: false,
  similarCache: {},
  similarScrollPos: 0,
  getTmdbRomaji: function (item) {
    if (!item) return "";
    const altList =
      item.alternative_titles?.results || item.alternative_titles?.titles || [];
    const rMatch =
      altList.find(
        (x) => x.iso_3166_1 === "JP" && /romaji|hepburn/i.test(x.type || ""),
      ) ||
      altList.find(
        (x) =>
          x.iso_3166_1 === "JP" && /^[A-Za-z0-9\s:.'\-]+$/.test(x.title || ""),
      );
    return rMatch?.title || "";
  },
  isValidSimilarCandidate: function (item, baseData, type) {
    if (!item || this.isBlocked(item, item.media_type || type)) return false;
    const targetIsAnime = this.isAnimeItem(baseData);
    const targetIsAnim = this.isAnimationItem(baseData);
    const targetHasComedy = (baseData?.genres || []).some(
      (g) => g.id === 35 || g === 35,
    );
    const targetGenreIds = (baseData?.genres || []).map((g) =>
      typeof g === "object" ? g.id : g,
    );
    const iAnime = this.isAnimeItem(item);
    const iAnim = this.isAnimationItem(item);
    if (!targetIsAnime && !targetIsAnim && (iAnime || iAnim)) return false;
    if (targetIsAnime && !iAnime) return false;
    const itemGIds =
      item.genre_ids ||
      (item.genres || []).map((g) => (typeof g === "object" ? g.id : g)) ||
      [];
    if (
      !targetHasComedy &&
      itemGIds.includes(35) &&
      !itemGIds.some((g) => targetGenreIds.includes(g))
    )
      return false;
    return true;
  },
  getShowAnimeInfo: function (showId, season = 1) {
    const sId = String(showId || "");
    if (
      this.currentAnimeInfo &&
      (!this.currentAnimeInfo._showId ||
        String(this.currentAnimeInfo._showId) === sId) &&
      this.currentAnimeInfo.sequelChain &&
      this.currentAnimeInfo.sequelChain.length > 1
    ) {
      return this.currentAnimeInfo;
    }
    if (!this.animeCache) return null;
    const s1 = this.animeCache[`${sId}_s1`];
    if (s1 && s1.sequelChain && s1.sequelChain.length > 1) return s1;
    if (
      this.currentAnimeInfo &&
      (!this.currentAnimeInfo._showId ||
        String(this.currentAnimeInfo._showId) === sId)
    ) {
      return this.currentAnimeInfo;
    }
    return (
      s1 || this.animeCache[`${sId}_s${season}`] || this.animeCache[sId] || null
    );
  },
  buildAniExploreAllGql: function (fields, isMovie, includeAiring = true) {
    const baseArgs =
      "type: ANIME, isAdult: false, id_in: $id_in, format_in: $format_in, genre_in: $genre_in, tag_in: $tag_in, season: $season, seasonYear: $seasonYear, countryOfOrigin: $countryOfOrigin";
    const airingBlock =
      !isMovie && includeAiring
        ? `airing: Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(${baseArgs}, sort: [POPULARITY_DESC], status: RELEASING, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser) { ${fields} } }`
        : "";
    return `query ($page: Int, $perPage: Int, $id_in: [Int], $format_in: [MediaFormat], $genre_in: [String], $tag_in: [String], $season: MediaSeason, $seasonYear: Int, $countryOfOrigin: CountryCode, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt, $newest_lesser: FuzzyDateInt) {
pop: Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(${baseArgs}, sort: [POPULARITY_DESC], status_not_in: [CANCELLED, NOT_YET_RELEASED], startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser) { ${fields} } }
trend: Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(${baseArgs}, sort: [TRENDING_DESC, POPULARITY_DESC], status_not_in: [CANCELLED, NOT_YET_RELEASED], startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser) { ${fields} } }
newest: Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(${baseArgs}, sort: [START_DATE_DESC], status_not_in: [CANCELLED, NOT_YET_RELEASED], startDate_greater: $startDate_greater, startDate_lesser: $newest_lesser) { ${fields} } }
${airingBlock}
}`;
  },
  buildAniCatalogGql: function (fields, hasPageInfo = false) {
    const pi = hasPageInfo ? "pageInfo { hasNextPage } " : "";
    return `query ($page: Int, $perPage: Int, $id_in: [Int], $format_in: [MediaFormat], $sort: [MediaSort], $genre_in: [String], $tag_in: [String], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $status_not_in: [MediaStatus], $countryOfOrigin: CountryCode, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt) {
Page(page: $page, perPage: $perPage) { ${pi}media(type: ANIME, isAdult: false, id_in: $id_in, format_in: $format_in, sort: $sort, genre_in: $genre_in, tag_in: $tag_in, season: $season, seasonYear: $seasonYear, status: $status, status_not_in: $status_not_in, countryOfOrigin: $countryOfOrigin, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser) { ${fields} } }
}`;
  },
  isAnimeItem: function (item) {
    if (!item) return false;
    if (
      item.is_anime ||
      item.is_anilist ||
      item.isAnime ||
      (typeof item.id === "string" && item.id.startsWith("ani_"))
    )
      return true;
    const kw = item.keywords?.results || item.keywords?.keywords || [];
    const hasAnimeKw =
      Array.isArray(kw) &&
      kw.some(
        (k) =>
          k.id === 210024 ||
          k.id === 287501 ||
          (k.name && /anime/i.test(k.name)),
      );
    const gList = item.genre_ids || item.genres || [];
    const isAnim = gList.some(
      (g) =>
        g === 16 ||
        g.id === 16 ||
        (g.name && g.name.toLowerCase() === "animation"),
    );
    if (!isAnim && !hasAnimeKw) return false;
    const oc = item.origin_country || [];
    const pc = item.production_countries || [];
    const lang = item.original_language || "";
    const isJP = this.hasCountryOrigin(item, "JP", "Japan", "ja");
    const isCN = this.hasCountryOrigin(item, "CN", "China", "zh");
    const isKR = this.hasCountryOrigin(item, "KR", "South Korea", "ko");
    if (["ja", "zh", "ko"].includes(lang)) return true;
    const hasOther =
      oc.some((c) => !["JP", "CN", "KR"].includes(c)) ||
      (oc.length === 0 &&
        pc.some(
          (c) =>
            !["JP", "CN", "KR"].includes(c.iso_3166_1) &&
            !["Japan", "China", "South Korea"].includes(c.name),
        ));
    return Boolean((isJP || isCN || isKR) && !hasOther);
  },
  isAnimationItem: function (item) {
    if (!item) return false;
    const gList = item.genre_ids || item.genres || [];
    return gList.some(
      (g) =>
        g === 16 ||
        g.id === 16 ||
        (g.name && g.name.toLowerCase() === "animation"),
    );
  },
  async fetchPrioritizedSimilar(id, type, currentData = null, page = 1) {
    const cacheKey = `${type}_${id}_v4`;
    if (this.similarCache) {
      const c = this.lruGet(this.similarCache, cacheKey);
      if (c) return c;
    }
    if (!this.similarCache) this.similarCache = {};
    let data = currentData;
    if (!data || !data.id || String(data.id) !== String(id)) {
      if (this.currentShow && String(this.currentShow.id) === String(id)) {
        data = this.currentShow;
      } else if (typeof id === "number" || !String(id).startsWith("tt")) {
        try {
          data = await this.api(`/${type}/${id}`, {
            append_to_response: "keywords",
          });
        } catch (e) {}
      }
    }
    const targetIsAnime = Boolean(
      this.isAnimeItem(data) || String(id).startsWith("ani_"),
    );
    if (targetIsAnime) {
      let aniId =
        data?.ani_id ||
        (String(id).startsWith("ani_")
          ? parseInt(String(id).replace("ani_", ""), 10)
          : null);
      if (!aniId && data) {
        const cachedInfo =
          this.animeCache?.[String(data.id)] ||
          this.animeCache?.[`${data.id}_s1`];
        if (cachedInfo?.aniId) aniId = cachedInfo.aniId;
      }
      const realTmdbId =
        !String(id).startsWith("ani_") && !String(id).startsWith("tt")
          ? id
          : data?.id &&
              !String(data.id).startsWith("ani_") &&
              !String(data.id).startsWith("tt")
            ? data.id
            : null;
      const tmdbPromise = realTmdbId
        ? Promise.all([
            this.api(`/${type}/${realTmdbId}/recommendations`, { page: page }),
            this.api(`/${type}/${realTmdbId}/similar`, { page: page }),
          ])
        : Promise.resolve([null, null]);
      const normTitle = (s) =>
        (s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const getBase = (s) =>
        (s || "")
          .replace(
            /\s*[:\-~]?\s*(?:(?:the\s+)?final\s+season|(?:[0-9]+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth)?\s*(?:season|cour|part)\s*(?:[0-9]+(?:st|nd|rd|th)?)?).*$/i,
            "",
          )
          .replace(/\s+(?:[0-9]+|ii|iii|iv|v|vi|vii|viii)\s*$/i, "")
          .replace(/\s*\((?:tv|ona|ova|special|season\s*\d+)\)\s*$/i, "")
          .trim();
      const isSeasonSequel = (s) => {
        if (!s) return false;
        if (
          /\b(?:season\s*0*(?:[2-9]|\d{2,})|0*(?:[2-9]|\d{2,})(?:st|nd|rd|th)\s+season|(?:second|third|fourth|fifth|sixth|final)\s+season|part\s*0*(?:[2-9]|\d{2,})|cour\s*0*(?:[2-9]|\d{2,})|0*(?:[2-9]|\d{2,})(?:nd|rd|th)\s+(?:cour|part)|s0*(?:[2-9]|\d{2,}))\b/i.test(
            s,
          )
        )
          return true;
        if (
          /(?:[:\-]\s*|\s+)(?:ii|iii|iv|v|vi|vii|viii|ix|x|[2-9])\s*$/i.test(s)
        )
          return true;
        return false;
      };
      const rootBases = new Set(
        [data?.title, data?.name, data?.original_title, data?.original_name]
          .filter(Boolean)
          .map((t) => normTitle(getBase(t)))
          .filter(Boolean),
      );
      const validRelTypes = [
        "PREQUEL",
        "SEQUEL",
        "PARENT",
        "SIDE_STORY",
        "SPIN_OFF",
        "ALTERNATIVE",
        "SUMMARY",
      ];
      const expandRelTypes = [
        "PREQUEL",
        "SEQUEL",
        "PARENT",
        "ALTERNATIVE",
        "SIDE_STORY",
        "SPIN_OFF",
      ];
      const validFormats = ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL"];
      const seriesFormats = ["TV", "TV_SHORT", "ONA"];
      const maxYear = new Date().getFullYear() + 1;
      const relFields = `id idMal format status isAdult episodes season seasonYear countryOfOrigin genres averageScore startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large medium }`;
      const recFields = `id idMal format status isAdult episodes season seasonYear countryOfOrigin genres averageScore startDate { year month day } title { romaji english userPreferred } coverImage { extraLarge large medium }`;
      let rootMedia = null;
      if (!aniId) {
        const romajiAlt = this.getTmdbRomaji(data);
        const rawName =
          data.name ||
          data.title ||
          romajiAlt ||
          data.original_name ||
          data.original_title ||
          "";
        const qTitle = (rawName || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        const qYear =
          parseInt(
            (data.first_air_date || data.release_date || "").substring(0, 4),
            10,
          ) || undefined;
        if (qTitle) {
          const fmtIn =
            type === "movie"
              ? ["MOVIE", "SPECIAL"]
              : ["TV", "TV_SHORT", "ONA", "OVA"];
          const searchQuery = `query ($s: String, $y: Int, $f: [MediaFormat]) { Page(page: 1, perPage: 3) { media(search: $s, seasonYear: $y, format_in: $f, sort: [SEARCH_MATCH, POPULARITY_DESC], type: ANIME) { id format title { romaji english userPreferred } startDate { year } } } }`;
          let sRes = await this.aniApi(searchQuery, {
            s: qTitle,
            y: qYear,
            f: fmtIn,
          });
          let list = sRes?.data?.Page?.media || [];
          if (list.length === 0 && qYear) {
            sRes = await this.aniApi(searchQuery, { s: qTitle, f: fmtIn });
            list = sRes?.data?.Page?.media || [];
          }
          const cand =
            (type === "tv"
              ? list.find((x) => x.format === "TV") || list[0]
              : list[0]) || null;
          if (cand) aniId = cand.id;
        }
      }
      if (aniId) {
        const rootQuery = `query ($id: Int) { Media(id: $id, type: ANIME) { id format episodes title { romaji english userPreferred } relations { edges { relationType node { ${relFields} } } } recommendations(sort: [RATING_DESC], perPage: 20) { nodes { mediaRecommendation { ${recFields} } } } } }`;
        const rootRes = await this.aniApi(rootQuery, { id: Number(aniId) });
        rootMedia = rootRes?.data?.Media;
      }
      if (rootMedia) {
        [
          rootMedia.title?.english,
          rootMedia.title?.romaji,
          rootMedia.title?.userPreferred,
        ]
          .filter(Boolean)
          .forEach((t) => rootBases.add(normTitle(getBase(t))));
        const seenSeriesBases = new Set(
          type === "tv" &&
            rootMedia.format !== "OVA" &&
            rootMedia.format !== "SPECIAL"
            ? rootBases
            : [],
        );
        const seenAniIds = new Set([Number(aniId)]);
        const seenTitles = new Set(
          [
            data?.title,
            data?.name,
            data?.original_title,
            data?.original_name,
            rootMedia.title?.english,
            rootMedia.title?.romaji,
            rootMedia.title?.userPreferred,
          ]
            .filter(Boolean)
            .map(normTitle),
        );
        const rawCandidateNodes = [];
        const visitedGraphIds = new Set([Number(aniId)]);
        let frontierIds = [];
        const isFutureDate = (sd) =>
          !sd?.year ||
          sd.year > maxYear ||
          new Date(sd.year, (sd.month || 1) - 1, sd.day || 1) > new Date();
        const collectEdges = (edges, hop) => {
          (edges || []).forEach((edge) => {
            const rel = edge?.relationType;
            const node = edge?.node;
            if (!node || !node.id || !validRelTypes.includes(rel)) return;
            if (!validFormats.includes(node.format)) return;
            if (expandRelTypes.includes(rel) && !visitedGraphIds.has(node.id)) {
              const canExpand =
                hop === 1
                  ? ["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY"].includes(rel)
                  : ["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY"].includes(
                      rel,
                    ) &&
                    ["TV", "TV_SHORT", "ONA", "OVA", "MOVIE"].includes(
                      node.format,
                    );
              if (canExpand) {
                visitedGraphIds.add(node.id);
                frontierIds.push(node.id);
              }
            }
            if (seenAniIds.has(node.id)) return;
            if (node.isAdult || (node.genres && node.genres.includes("Hentai")))
              return;
            if (
              node.status === "CANCELLED" ||
              node.status === "NOT_YET_RELEASED"
            )
              return;
            if (isFutureDate(node.startDate)) return;
            seenAniIds.add(node.id);
            rawCandidateNodes.push({ node, rel, hop });
          });
        };
        collectEdges(rootMedia.relations?.edges, 1);
        for (let step = 2; step <= 4 && frontierIds.length > 0; step++) {
          const batchIds = frontierIds.slice(0, 15);
          frontierIds = [];
          const hopQuery = `query ($ids: [Int]) { Page(page: 1, perPage: 15) { media(id_in: $ids, type: ANIME) { id relations { edges { relationType node { ${relFields} } } } } } }`;
          const hopRes = await this.aniApi(hopQuery, { ids: batchIds });
          const hopMediaList = hopRes?.data?.Page?.media || [];
          hopMediaList.forEach((hm) => collectEdges(hm.relations?.edges, step));
        }
        rawCandidateNodes.sort(
          (a, b) =>
            (a.node.startDate?.year || 9999) - (b.node.startDate?.year || 9999),
        );
        const franchiseNodes = [];
        const absorbedChainIds = new Set([Number(aniId)]);
        const totalTmdbEps =
          (data?.seasons || [])
            .filter(
              (s) =>
                s &&
                s.season_number > 0 &&
                (!this.isSeasonAired || this.isSeasonAired(s)),
            )
            .reduce((sum, s) => sum + (s.episode_count || 0), 0) ||
          data?.number_of_episodes ||
          0;
        const seqChain =
          this.currentAnimeInfo &&
          (!this.currentAnimeInfo._showId ||
            String(this.currentAnimeInfo._showId) === String(data?.id || id))
            ? this.currentAnimeInfo.sequelChain || []
            : [];
        let accumEps = rootMedia.episodes || seqChain[0]?.episodes || 0;
        for (let ci = 1; ci < seqChain.length; ci++) {
          const ce = seqChain[ci];
          if (!ce || !ce.id || ce._isSpecial || ce.format === "MOVIE") continue;
          if (totalTmdbEps > 0 && accumEps < totalTmdbEps) {
            absorbedChainIds.add(ce.id);
            accumEps += ce.episodes || 12;
          } else {
            break;
          }
        }
        rawCandidateNodes.forEach((item) => {
          const node = item.node;
          const rawTitles = [
            node.title?.english,
            node.title?.romaji,
            node.title?.userPreferred,
          ].filter(Boolean);
          if (
            !["MOVIE", "OVA", "SPECIAL"].includes(node.format) &&
            rawTitles.some((rt) => isSeasonSequel(rt))
          )
            return;
          if (absorbedChainIds.has(node.id)) return;
          if (seriesFormats.includes(node.format)) {
            const nodeBases = rawTitles
              .map((rt) => normTitle(getBase(rt)))
              .filter(Boolean);
            if (nodeBases.some((b) => seenSeriesBases.has(b))) return;
            nodeBases.forEach((b) => seenSeriesBases.add(b));
          }
          franchiseNodes.push(item);
        });
        franchiseNodes.sort((a, b) => {
          const dA =
            (a.node.startDate?.year || 9999) * 10000 +
            (a.node.startDate?.month || 12) * 100 +
            (a.node.startDate?.day || 31);
          const dB =
            (b.node.startDate?.year || 9999) * 10000 +
            (b.node.startDate?.month || 12) * 100 +
            (b.node.startDate?.day || 31);
          if (dA !== dB) return dA - dB;
          return (b.node.averageScore || 0) - (a.node.averageScore || 0);
        });
        const toCardObj = (m) => {
          [m.title?.english, m.title?.romaji, m.title?.userPreferred]
            .filter(Boolean)
            .forEach((t) => seenTitles.add(this.normTitle(t)));
          const cObj = this.toAniCard(m, m.format === "MOVIE");
          if (cObj && this.animeCache && this.animeCache[cObj.id]) {
            const pList = this.animeCache[cObj.id].parentTitles || [];
            [
              data?.title,
              data?.name,
              rootMedia?.title?.english,
              rootMedia?.title?.romaji,
            ]
              .filter(Boolean)
              .forEach((pt) => {
                if (!pList.includes(pt)) pList.push(pt);
              });
            this.animeCache[cObj.id].parentTitles = pList;
            if (m.format !== "TV") this.animeCache[cObj.id].hasParent = true;
          }
          return cObj;
        };
        const aniFranchiseItems = franchiseNodes
          .map((x) => toCardObj(x.node))
          .filter((i) => i.poster_path && !this.isBlocked(i, i.media_type));
        const tmdbByNorm = new Map();
        const tmdbRawList = [];
        if (realTmdbId) {
          const [tRec, tSim] = await tmdbPromise;
          const seenTmdbIds = new Set([String(realTmdbId)]);
          [...(tRec?.results || []), ...(tSim?.results || [])].forEach((c) => {
            if (!c || !c.id || seenTmdbIds.has(String(c.id))) return;
            if (!this.isAnimeItem(c) || this.isBlocked(c, c.media_type || type))
              return;
            seenTmdbIds.add(String(c.id));
            c.media_type = c.media_type || type;
            tmdbRawList.push(c);
            [c.title, c.name, c.original_title, c.original_name]
              .filter(Boolean)
              .map(normTitle)
              .forEach((nt) => {
                if (nt && !tmdbByNorm.has(nt)) tmdbByNorm.set(nt, c);
              });
          });
        }
        const aniRecItems = [];
        const usedTmdbIds = new Set();
        (rootMedia.recommendations?.nodes || []).forEach((r) => {
          const m = r?.mediaRecommendation;
          if (
            !m ||
            !m.id ||
            seenAniIds.has(m.id) ||
            !validFormats.includes(m.format)
          )
            return;
          if (m.isAdult || (m.genres && m.genres.includes("Hentai"))) return;
          if (m.status === "CANCELLED" || m.status === "NOT_YET_RELEASED")
            return;
          if (isFutureDate(m.startDate)) return;
          const rawTitles = [
            m.title?.english,
            m.title?.romaji,
            m.title?.userPreferred,
          ].filter(Boolean);
          if (
            m.format !== "MOVIE" &&
            rawTitles.some((rt) => isSeasonSequel(rt))
          )
            return;
          const mTitles = rawTitles.map(normTitle);
          if (mTitles.some((t) => seenTitles.has(t))) return;
          const mBases = rawTitles
            .map((rt) => normTitle(getBase(rt)))
            .filter(Boolean);
          if (
            mBases.some(
              (b) =>
                seenSeriesBases.has(b) ||
                Array.from(rootBases).some(
                  (rb) => rb.length >= 4 && (b === rb || b.startsWith(rb)),
                ),
            )
          )
            return;
          let matchedTmdbCard = null;
          for (const mt of mTitles) {
            if (tmdbByNorm.has(mt)) {
              matchedTmdbCard = tmdbByNorm.get(mt);
              break;
            }
          }
          if (seriesFormats.includes(m.format)) {
            mBases.forEach((b) => seenSeriesBases.add(b));
          }
          seenAniIds.add(m.id);
          if (matchedTmdbCard && !usedTmdbIds.has(String(matchedTmdbCard.id))) {
            usedTmdbIds.add(String(matchedTmdbCard.id));
            mTitles.forEach((t) => seenTitles.add(t));
            [
              matchedTmdbCard.title,
              matchedTmdbCard.name,
              matchedTmdbCard.original_title,
              matchedTmdbCard.original_name,
            ]
              .filter(Boolean)
              .forEach((t) => seenTitles.add(normTitle(t)));
            aniRecItems.push(matchedTmdbCard);
            return;
          }
          const card = toCardObj(m);
          if (card.poster_path && !this.isBlocked(card, card.media_type))
            aniRecItems.push(card);
        });
        const tmdbExtraItems = [];
        tmdbRawList.forEach((c) => {
          if (usedTmdbIds.has(String(c.id))) return;
          const cTitles = [c.title, c.name, c.original_title, c.original_name]
            .filter(Boolean)
            .map(normTitle);
          if (cTitles.some((t) => seenTitles.has(t))) return;
          cTitles.forEach((t) => seenTitles.add(t));
          tmdbExtraItems.push(c);
        });
        const finalAnimeItems = [
          ...aniFranchiseItems,
          ...aniRecItems,
          ...tmdbExtraItems,
        ];
        if (finalAnimeItems.length > 0) {
          this.lruSet(this.similarCache, cacheKey, finalAnimeItems, "similar");
          return finalAnimeItems;
        }
      }
      if (realTmdbId) {
        const [tRec, tSim] = await tmdbPromise;
        const fallbackList = [
          ...(tRec?.results || []),
          ...(tSim?.results || []),
        ].filter(
          (c) =>
            c &&
            c.id &&
            !this.isBlocked(c, c.media_type || type) &&
            String(c.id) !== String(realTmdbId),
        );
        const uniqueFallback = [];
        const seenFIds = new Set();
        fallbackList.forEach((c) => {
          if (!seenFIds.has(String(c.id))) {
            seenFIds.add(String(c.id));
            c.media_type = c.media_type || type;
            uniqueFallback.push(c);
          }
        });
        if (uniqueFallback.length > 0) {
          if (!aniId)
            this.lruSet(this.similarCache, cacheKey, uniqueFallback, "similar");
          return uniqueFallback;
        }
      }
    }
    const [recRes, simRes] = await Promise.all([
      this.api(`/${type}/${id}/recommendations`, {
        page: page,
      }),
      this.api(`/${type}/${id}/similar`, {
        page: page,
      }),
    ]);
    const checkCandidate = (item) =>
      this.isValidSimilarCandidate(item, data, type);
    const seenIds = new Set([String(id)]);
    const targetGenreIds = (data?.genres || []).map((g) =>
      typeof g === "object" ? g.id : g,
    );
    const franchiseItems = [];
    const tropeItems = [];
    const scoredCandidates = [];

    const collectCandidates = (items, targetList, customFilter = null) => {
      for (const it of items || []) {
        const sid = String(it.id);
        if (
          !seenIds.has(sid) &&
          checkCandidate(it) &&
          (!customFilter || customFilter(it))
        ) {
          seenIds.add(sid);
          it.media_type = it.media_type || type;
          targetList.push(it);
        }
      }
    };

    if (type === "movie" && data?.belongs_to_collection?.id) {
      try {
        const col = await this.api(
          `/collection/${data.belongs_to_collection.id}`,
        );
        const parts =
          col && Array.isArray(col.parts)
            ? col.parts.filter(
                (p) => String(p.id) !== String(id) && checkCandidate(p),
              )
            : [];
        parts.sort((a, b) =>
          (a.release_date || "").localeCompare(b.release_date || ""),
        );
        collectCandidates(parts, franchiseItems);
      } catch (e) {}
    }
    const kwList =
      (type === "movie" ? data?.keywords?.keywords : data?.keywords?.results) ||
      [];
    const kwIds = kwList.map((x) => x.id);
    const netIds = (data?.networks || []).map((x) => x.id);
    if (type === "tv" && netIds.includes(71)) {
      const isHero = kwList.some(
        (w) =>
          [9715, 9717, 155030, 158456, 849, 208610, 229266].includes(w.id) ||
          /superhero|comic|dc\s*comics|vigilante/i.test(w.name),
      );
      const isVamp =
        !isHero && kwList.some((w) => [3133, 3383, 2343].includes(w.id));
      const cwKw = isHero ? 9715 : isVamp ? "3133|3383" : null;
      if (cwKw) {
        try {
          const cwRes = await this.api("/discover/tv", {
            with_networks: 71,
            with_keywords: cwKw,
            sort_by: "popularity.desc",
          });
          collectCandidates(cwRes?.results, franchiseItems);
        } catch (e) {}
      }
    }
    const allCandidates = [
      ...(recRes?.results || []),
      ...(simRes?.results || []),
    ];
    const targetTitle = (
      (data && (data.title || data.name)) ||
      ""
    ).toLowerCase();
    const fGroups = [
      [
        "game of thrones",
        "house of the dragon",
        "knight of the seven kingdoms",
      ],
      ["breaking bad", "better call saul", "el camino"],
      ["yellowstone", "1883", "1923", "dutton"],
      ["the boys", "gen v"],
      ["big bang theory", "young sheldon"],
    ];
    for (const c of allCandidates) {
      if (seenIds.has(String(c.id)) || !checkCandidate(c)) continue;
      const cTitle = (c.title || c.name || "").toLowerCase();
      const cOver = (c.overview || "").toLowerCase();
      const tOver = (data?.overview || "").toLowerCase();
      let isFranchise = false;
      if (
        targetTitle.includes(" ") &&
        targetTitle.length >= 8 &&
        (cTitle.includes(targetTitle) || targetTitle.includes(cTitle))
      ) {
        isFranchise = true;
      }
      if (
        cOver &&
        cOver.includes(targetTitle) &&
        /spin[\s\-]?off|prequel|sequel|events of|world of|universe/i.test(cOver)
      )
        isFranchise = true;
      if (
        tOver &&
        tOver.includes(cTitle) &&
        /spin[\s\-]?off|prequel|sequel|events of|world of|universe/i.test(tOver)
      )
        isFranchise = true;
      if (
        fGroups.some(
          (g) =>
            g.some((k) => targetTitle.includes(k)) &&
            g.some((k) => cTitle.includes(k)),
        )
      ) {
        isFranchise = true;
      }
      if (isFranchise) {
        seenIds.add(String(c.id));
        c.media_type = type;
        franchiseItems.push(c);
      }
    }
    const tropeConfigs = [
      {
        kws: [1279, 11612, 13005, 14781, 188343, 40895],
        fallback: "11612|13005|1279",
      },
      {
        kws: [10909, 162813, 210596, 214780, 203173],
        fallback: "10909|162813",
      },
      { kws: [6149, 9946, 11578, 14819, 186064], fallback: "6149|9946" },
    ];
    const matchedTrope = tropeConfigs.find((cfg) =>
      kwIds.some((id) => cfg.kws.includes(id)),
    );
    const hasMedical = kwIds.some((id) =>
      [1279, 11612, 13005, 14781, 188343, 40895].includes(id),
    );
    if (matchedTrope) {
      const premiseKwParam =
        matchedTrope.kws.filter((id) => kwIds.includes(id)).join("|") ||
        matchedTrope.fallback;
      try {
        const disc = await this.api(`/discover/${type}`, {
          with_keywords: premiseKwParam,
          sort_by: "popularity.desc",
        });
        collectCandidates(disc?.results, tropeItems);
      } catch (e) {}
    }
    collectCandidates(
      recRes?.results,
      scoredCandidates,
      (r) => !(hasMedical && r.id === 1396),
    );
    collectCandidates(simRes?.results, scoredCandidates);
    scoredCandidates.sort((a, b) => {
      const aG =
        a.genre_ids ||
        (a.genres || []).map((g) => (typeof g === "object" ? g.id : g)) ||
        [];
      const bG =
        b.genre_ids ||
        (b.genres || []).map((g) => (typeof g === "object" ? g.id : g)) ||
        [];
      const aMatch = aG.filter((g) => targetGenreIds.includes(g)).length;
      const bMatch = bG.filter((g) => targetGenreIds.includes(g)).length;
      return bMatch - aMatch;
    });
    const finalItems = [...franchiseItems, ...tropeItems, ...scoredCandidates];
    this.lruSet(this.similarCache, cacheKey, finalItems, "similar");
    return finalItems;
  },
  syncSimilarSearchHeader(type, title) {
    const t = type || this.similarSearch?.type;
    const tit = title || this.similarSearch?.title || "";
    const categoryText = t === "movie" ? "Similar Movies" : "Similar Shows";
    const textEl = this.$g("similar-search-badge-text");
    if (textEl) textEl.innerText = `${categoryText} : ${tit}`;
    const wrapEl = this.$g("similar-search-badge-wrap");
    if (wrapEl) wrapEl.style.display = "flex";
  },
  async openMoreSimilar(id, type, title, currentData = null) {
    if (
      document.activeElement &&
      typeof document.activeElement.blur === "function"
    )
      document.activeElement.blur();
    this.similarScrollPos = 0;
    this.openingSimilarSearch = true;
    this.navigate("search");
    this.openingSimilarSearch = false;
    this.resetSearchYearSort();
    this.similarSearch = {
      id: id,
      type: type,
      title: title,
      data: currentData || this.currentShow,
      page: 1,
      totalPages: 1,
    };
    this.syncSimilarSearchHeader(type, title);
    const inp = this.$g("search-input");
    if (inp) {
      inp.value = "";
      inp.blur();
      inp.style.display = "none";
    }
    const goBtn = document.querySelector("#view-search .btn-search-go");
    if (goBtn) goBtn.style.display = "none";
    this.toggleClearBtn("search-input", "main-clear-btn");
    this.updateSearchFilterBar();
    const recentsEl = this.$g("search-recents");
    if (recentsEl) {
      recentsEl.innerHTML = "";
      recentsEl.style.display = "none";
    }
    const sSugg = this.$g("search-suggestion");
    if (sSugg) {
      sSugg.innerHTML = "";
      sSugg.style.display = "none";
    }
    const grid = this.$g("search-grid");
    if (grid)
      grid.innerHTML =
        '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    this.forceScrollTop(false);
    await this.loadSimilarSearchPage(1, true);
    this.forceScrollTop(true);
  },
  renderSimilarSearchResults: function () {
    if (!this.similarSearch) return;
    const list = this.similarSearch.items || [];
    const grid = this.$g("search-grid");
    const syWrap = this.$g("search-year-sort-wrap");
    if (syWrap) syWrap.style.display = "none";
    if (list.length === 0) {
      grid.innerHTML = '<div class="msg-box">No similar items found.</div>';
    } else {
      grid.innerHTML = list
        .map((i) => this.buildCard(i, i.media_type || this.similarSearch.type))
        .join("");
      this.markImgsLoaded(grid.querySelectorAll("img"));
    }
  },
  async loadSimilarSearchPage(page, reset = false) {
    if (!this.similarSearch || this.similarSearchLoading) return;
    this.similarSearchLoading = true;
    this.startLoader();
    const { id, type, data: showData } = this.similarSearch;
    if (reset) {
      const results = await this.fetchPrioritizedSimilar(id, type, showData, 1);
      this.similarSearch.page = 1;
      this.similarSearch.totalPages =
        String(id).startsWith("ani_") || this.isAnimeItem(showData) ? 1 : 5;
      this.similarSearch.items = results;
    } else {
      const recData = await this.api(`/${type}/${id}/recommendations`, {
        page: page,
      });
      this.similarSearch.page = page;
      this.similarSearch.totalPages = (recData && recData.total_pages) || 1;
      const normT = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const seenIds = new Set(
        (this.similarSearch.items || []).map((i) => String(i.id)),
      );
      const seenTitles = new Set(
        (this.similarSearch.items || [])
          .map((i) => normT(i.title || i.name))
          .filter(Boolean),
      );
      seenIds.add(String(id));
      const baseShow = showData || this.currentShow;
      const nextResults = (recData?.results || []).filter((i) => {
        if (
          seenIds.has(String(i.id)) ||
          seenTitles.has(normT(i.title || i.name))
        )
          return false;
        return this.isValidSimilarCandidate(i, baseShow, type);
      });
      this.similarSearch.items = [
        ...(this.similarSearch.items || []),
        ...nextResults,
      ];
    }
    this.renderSimilarSearchResults();
    if (reset) {
      this.forceScrollTop(true);
    }
    this.similarSearchLoading = false;
    this.stopLoader();
  },
  loadNextSimilarPage: function () {
    if (
      this.similarSearch &&
      !this.similarSearchLoading &&
      this.similarSearch.page < this.similarSearch.totalPages
    ) {
      this.loadSimilarSearchPage(this.similarSearch.page + 1, false);
    }
  },
  clearSimilarSearch: function () {
    this.similarSearch = null;
    this.similarScrollPos = 0;
    const wrapEl = this.$g("similar-search-badge-wrap");
    if (wrapEl) wrapEl.style.display = "none";
    const syWrap = this.$g("search-year-sort-wrap");
    if (syWrap) syWrap.style.display = "none";
    const inp = this.$g("search-input");
    if (inp) inp.style.display = "";
    const goBtn = document.querySelector("#view-search .btn-search-go");
    if (goBtn) goBtn.style.display = "";
    this.$g("search-grid").innerHTML = "";
    this.restorePreviousSearchState(true);
  },
  renderSeasonCards: function (seasons, activeSeason, data) {
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
    const grid = this.$g("si-seasons-grid");
    if (!grid) return;
    const showPoster = data?.poster_path
      ? this.getImg(data.poster_path, "poster")
      : data?.backdrop_path
        ? this.getImg(data.backdrop_path, "backdrop")
        : "";
    const showYear = data ? this.getItemYear(data) : "";
    const isAnim = Boolean(
      data?.is_anime ||
      data?.is_anilist ||
      data?.isAnime ||
      (data?.genres || []).some(
        (g) => g.id === 16 || (g.name && g.name.toLowerCase() === "animation"),
      ),
    );
    const isJapan = this.hasCountryOrigin
      ? this.hasCountryOrigin(data, "JP", "Japan", "ja")
      : true;
    const isAnime = Boolean(
      data?.isAnime ||
      data?.is_anilist ||
      (isAnim && isJapan) ||
      (this.isAnimeItem && this.isAnimeItem(data)),
    );
    const isMultiSeasonTmdb = Boolean(
      data?.seasons &&
      data.seasons.filter((s) => (s.season_number || s.season) > 0).length > 1,
    );
    const curShowAnimeInfo =
      this.currentAnimeInfo &&
      (!this.currentAnimeInfo._showId ||
        String(this.currentAnimeInfo._showId) === String(data?.id))
        ? this.currentAnimeInfo
        : null;
    const allSeqChain =
      curShowAnimeInfo?.sequelChain ||
      this.animeCache?.[`${data?.id}_s1`]?.sequelChain ||
      this.animeCache?.[String(data?.id)]?.sequelChain ||
      null;
    const seqChain = !isMultiSeasonTmdb ? allSeqChain : null;
    const lastPlayedS = this.getLastPlayedSeason(data);
    grid.innerHTML = (seasons || [])
      .map((s) => {
        const sNum = parseInt(s.season_number || s.season || s, 10) || 1;
        const sName = s.name || `Season ${sNum}`;
        let sYear = "";
        if (s.air_date) {
          const yr = new Date(s.air_date).getFullYear();
          if (!isNaN(yr)) sYear = yr;
        } else if (s.startDate?.year) {
          sYear = s.startDate.year;
        }
        if (!sYear && showYear && (isMultiSeasonTmdb || sNum === 1))
          sYear = showYear;
        if (isAnime) {
          const VALID_SEASONS = {
            WINTER: "Winter",
            SPRING: "Spring",
            SUMMER: "Summer",
            FALL: "Fall",
          };
          const sCache =
            this.animeCache?.[`${data?.id}_s${sNum}`] ||
            (sNum === 1
              ? this.animeCache?.[`${data?.id}_s1`] ||
                this.animeCache?.[String(data?.id)]
              : null);
          const chainEntry = (seqChain || []).find(
            (e) => (e.season || 1) === sNum,
          );
          const tmdbS = (data?.seasons || []).find(
            (ts) => (ts.season_number || ts.season) == sNum,
          );
          const ep1AirDate =
            s.episodes?.[0]?.air_date ||
            this.episodeCache?.[`${data?.id}_s${sNum}`]?.episodes?.[0]
              ?.air_date ||
            tmdbS?.episodes?.[0]?.air_date ||
            (sCache?.fromEpisode ? sCache.airDate : null) ||
            null;
          const effectiveAirDate =
            s.air_date ||
            tmdbS?.air_date ||
            ep1AirDate ||
            (isMultiSeasonTmdb ? null : chainEntry?.air_date) ||
            null;
          let airMonth = null;
          let airYear = null;
          if (effectiveAirDate && typeof effectiveAirDate === "string") {
            const parts = effectiveAirDate.split("-");
            if (parts.length >= 1) airYear = parseInt(parts[0], 10) || null;
            if (parts.length >= 2) airMonth = parseInt(parts[1], 10) || null;
          }
          if (!airMonth && s.startDate?.month) airMonth = s.startDate.month;
          if (!airYear && s.startDate?.year) airYear = s.startDate.year;
          if (!airMonth && chainEntry?.startDate?.month)
            airMonth = chainEntry.startDate.month;
          if (!airYear && chainEntry?.startDate?.year)
            airYear = chainEntry.startDate.year;
          let seasonName = "";
          const candidateSeason = String(
            s.broadcastSeason ||
              (VALID_SEASONS[String(s.season).toUpperCase()] ? s.season : "") ||
              (sCache?.fromEpisode || !isMultiSeasonTmdb
                ? sCache?.season
                : "") ||
              chainEntry?.broadcastSeason ||
              (VALID_SEASONS[String(chainEntry?.season).toUpperCase()]
                ? chainEntry.season
                : "") ||
              "",
          )
            .trim()
            .toUpperCase();
          if (VALID_SEASONS[candidateSeason]) {
            seasonName = VALID_SEASONS[candidateSeason];
          } else if (airMonth) {
            if (airMonth >= 1 && airMonth <= 3) seasonName = "Winter";
            else if (airMonth >= 4 && airMonth <= 6) seasonName = "Spring";
            else if (airMonth >= 7 && airMonth <= 9) seasonName = "Summer";
            else if (airMonth >= 10 && airMonth <= 12) seasonName = "Fall";
          }
          const yrVal =
            airYear ||
            s.startDate?.year ||
            chainEntry?.startDate?.year ||
            (VALID_SEASONS[candidateSeason] &&
            (sCache?.fromEpisode || !isMultiSeasonTmdb)
              ? sCache?.seasonYear
              : null) ||
            sYear ||
            (data ? this.getItemYear(data) : "");
          if (seasonName && yrVal) {
            sYear = `${seasonName} ${yrVal}`;
          } else if (yrVal) {
            sYear = String(yrVal);
          }
          if (data?.id && sNum) {
            if (!this.animeCache) this.animeCache = {};
            const sKey = `${data.id}_s${sNum}`;
            if (!this.animeCache[sKey]) this.animeCache[sKey] = {};
            if (seasonName)
              this.animeCache[sKey].season = seasonName.toUpperCase();
            if (yrVal) this.animeCache[sKey].seasonYear = parseInt(yrVal, 10);
            if (effectiveAirDate) {
              this.animeCache[sKey].airDate = effectiveAirDate;
              if (ep1AirDate) this.animeCache[sKey].fromEpisode = true;
            }
            if (sNum === 1) {
              if (!this.animeCache[String(data.id)])
                this.animeCache[String(data.id)] = {};
              if (seasonName)
                this.animeCache[String(data.id)].season =
                  seasonName.toUpperCase();
              if (yrVal)
                this.animeCache[String(data.id)].seasonYear = parseInt(
                  yrVal,
                  10,
                );
              if (effectiveAirDate)
                this.animeCache[String(data.id)].airDate = effectiveAirDate;
            }
            this.persistCache("anime");
          }
        }
        const tmdbSeasonObj = (data?.seasons || []).find(
          (ts) => (ts.season_number || ts.season) == (s._tmdbSeason || sNum),
        );
        const matchedAniEntry =
          s._aniEntry ||
          (allSeqChain || []).find((e) => (e.season || 1) === sNum);
        const seasonPosterRaw =
          isAnime && matchedAniEntry?.poster_path
            ? matchedAniEntry.poster_path
            : s.poster_path ||
              tmdbSeasonObj?.poster_path ||
              matchedAniEntry?.poster_path ||
              "";
        const bgImg =
          (seasonPosterRaw ? this.getImg(seasonPosterRaw, "poster") : "") ||
          showPoster ||
          (data?.backdrop_path
            ? this.getImg(data.backdrop_path, "backdrop")
            : "");
        const isSel = lastPlayedS !== null && sNum === lastPlayedS;
        const safeTitle = sName.replace(/"/g, "&quot;");
        const sLen = sName.length;
        const sizeCls =
          sLen > 55
            ? " size-xxs"
            : sLen > 40
              ? " size-xs"
              : sLen > 26
                ? " size-sm"
                : sLen > 16
                  ? " size-md"
                  : "";
        const imgTag = bgImg
          ? `<img src="${bgImg}" class="si-season-img" loading="lazy" onload="this.classList.add('loaded')">`
          : "";
        return `<div class="si-season-card${isSel ? " selected" : ""}" data-season-num="${sNum}" onclick="app.selectSeasonCard(${sNum})">${imgTag}<div class="si-season-card-content"><div class="si-season-title${sizeCls}">${safeTitle}</div><div class="si-season-year">${sYear || ""}</div></div></div>`;
      })
      .join("");
    this.applySeasonViewMode();
    if (isAnime && data?.id) {
      const unresolved = (seasons || [])
        .filter((s) => !s?._isHybridSplit)
        .map((s) => parseInt(s.season_number || s.season || s, 10) || 1)
        .filter((sNum) => {
          const tmdbS = (data?.seasons || []).find(
            (ts) => (ts.season_number || ts.season) == sNum,
          );
          if (tmdbS?.air_date) return false;
          const sCache = this.animeCache?.[`${data.id}_s${sNum}`];
          if (sCache?.fromEpisode && sCache?.season && sCache?.seasonYear)
            return false;
          return true;
        });
      if (unresolved.length > 0) {
        this.resolveAnimeSeasonDates(data.id, unresolved);
      }
    }
  },
  resolveAnimeSeasonDates: async function (showId, seasonNums) {
    if (!showId || !seasonNums || seasonNums.length === 0) return;
    const showData =
      this.currentShow && String(this.currentShow.id) === String(showId)
        ? this.currentShow
        : this.getShowDetailsCache(`tv_${showId}`)?.data || null;
    const isMultiSeasonTmdb = Boolean(
      showData?.seasons &&
      showData.seasons.filter((s) => (s.season_number || s.season) > 0).length >
        1,
    );
    if (!isMultiSeasonTmdb) {
      const s1Data = await this.fetchSeasonEpisodes(showId, 1);
      const eps = s1Data?.episodes || [];
      if (eps.length === 0) return;
      const curShowAnimeInfo =
        this.currentAnimeInfo &&
        (!this.currentAnimeInfo._showId ||
          String(this.currentAnimeInfo._showId) === String(showId))
          ? this.currentAnimeInfo
          : null;
      const seqChain =
        curShowAnimeInfo?.sequelChain ||
        this.animeCache?.[`${showId}_s1`]?.sequelChain ||
        this.animeCache?.[String(showId)]?.sequelChain ||
        null;
      seasonNums.forEach((sNum) => {
        const epForSeason =
          eps.find((ep) => {
            if (!seqChain || seqChain.length <= 1)
              return ep.episode_number === 1;
            return (
              this.resolveAnimeSequelEp(ep.episode_number, seqChain).season ===
              sNum
            );
          }) || (sNum === 1 ? eps[0] : null);
        const epDate = epForSeason?.air_date;
        if (epDate && typeof epDate === "string") {
          const parts = epDate.split("-");
          const yr = parseInt(parts[0], 10);
          const mo = parseInt(parts[1], 10);
          let sName = "";
          if (mo >= 1 && mo <= 3) sName = "Winter";
          else if (mo >= 4 && mo <= 6) sName = "Spring";
          else if (mo >= 7 && mo <= 9) sName = "Summer";
          else if (mo >= 10 && mo <= 12) sName = "Fall";
          if (sName && yr) {
            const sKey = `${showId}_s${sNum}`;
            if (!this.animeCache) this.animeCache = {};
            if (!this.animeCache[sKey]) this.animeCache[sKey] = {};
            this.animeCache[sKey].season = sName.toUpperCase();
            this.animeCache[sKey].seasonYear = yr;
            this.animeCache[sKey].airDate = epDate;
            this.animeCache[sKey].fromEpisode = true;
            const cardEl =
              this.currentShow && String(this.currentShow.id) === String(showId)
                ? document.querySelector(
                    `.si-season-card[data-season-num="${sNum}"]`,
                  )
                : null;
            if (cardEl) {
              let yrEl = cardEl.querySelector(".si-season-year");
              if (!yrEl) {
                const content = cardEl.querySelector(".si-season-card-content");
                if (content) {
                  yrEl = document.createElement("div");
                  yrEl.className = "si-season-year";
                  content.appendChild(yrEl);
                }
              }
              if (yrEl) yrEl.textContent = `${sName} ${yr}`;
            }
          }
        }
      });
      this.persistCache("anime");
      return;
    }
    for (let i = 0; i < seasonNums.length; i += 3) {
      if (!this.currentShow || String(this.currentShow.id) !== String(showId))
        return;
      const batch = seasonNums.slice(i, i + 3);
      await Promise.all(
        batch.map(async (sNum) => {
          try {
            const sData = await this.fetchSeasonEpisodes(showId, sNum);
            const ep1Date = sData?.episodes?.[0]?.air_date || sData?.air_date;
            if (ep1Date && typeof ep1Date === "string") {
              const parts = ep1Date.split("-");
              const yr = parseInt(parts[0], 10);
              const mo = parseInt(parts[1], 10);
              let sName = "";
              if (mo >= 1 && mo <= 3) sName = "Winter";
              else if (mo >= 4 && mo <= 6) sName = "Spring";
              else if (mo >= 7 && mo <= 9) sName = "Summer";
              else if (mo >= 10 && mo <= 12) sName = "Fall";
              if (sName && yr) {
                const sKey = `${showId}_s${sNum}`;
                if (!this.animeCache) this.animeCache = {};
                if (!this.animeCache[sKey]) this.animeCache[sKey] = {};
                this.animeCache[sKey].season = sName.toUpperCase();
                this.animeCache[sKey].seasonYear = yr;
                this.animeCache[sKey].airDate = ep1Date;
                this.animeCache[sKey].fromEpisode = true;
                if (sNum === 1) {
                  if (!this.animeCache[String(showId)])
                    this.animeCache[String(showId)] = {};
                  this.animeCache[String(showId)].season = sName.toUpperCase();
                  this.animeCache[String(showId)].seasonYear = yr;
                  this.animeCache[String(showId)].airDate = ep1Date;
                  this.animeCache[String(showId)].fromEpisode = true;
                }
                this.persistCache("anime");
                const cardEl =
                  this.currentShow &&
                  String(this.currentShow.id) === String(showId)
                    ? document.querySelector(
                        `.si-season-card[data-season-num="${sNum}"]`,
                      )
                    : null;
                if (cardEl) {
                  let yrEl = cardEl.querySelector(".si-season-year");
                  if (!yrEl) {
                    const content = cardEl.querySelector(
                      ".si-season-card-content",
                    );
                    if (content) {
                      yrEl = document.createElement("div");
                      yrEl.className = "si-season-year";
                      content.appendChild(yrEl);
                    }
                  }
                  if (yrEl) yrEl.textContent = `${sName} ${yr}`;
                }
              }
            }
          } catch (e) {}
        }),
      );
    }
  },
  getLastPlayedSeason: function (data = this.currentShow) {
    if (!data) return null;
    const hist = this.getHistory();
    const showInHist = hist.find((x) => String(x.id) === String(data.id));
    if (
      !showInHist ||
      showInHist.last_season === undefined ||
      showInHist.last_season === null
    )
      return null;
    if (
      showInHist.last_hybrid_season !== undefined &&
      showInHist.last_hybrid_season !== null
    ) {
      return parseInt(showInHist.last_hybrid_season, 10);
    }
    const isMultiSeasonTmdb = Boolean(
      data.seasons &&
      data.seasons.filter((s) => (s.season_number || s.season) > 0).length > 1,
    );
    const animeInfo =
      this.getShowAnimeInfo(data.id) ||
      (this.animeCache
        ? this.animeCache[`${data.id}_s1`] || this.animeCache[String(data.id)]
        : null);
    const seqChain = !isMultiSeasonTmdb ? animeInfo?.sequelChain || null : null;
    if (seqChain && seqChain.length > 1 && showInHist.last_episode) {
      return this.resolveAnimeSequelEp(showInHist.last_episode, seqChain)
        .season;
    }
    return parseInt(showInHist.last_season, 10);
  },
  updateSeasonCardsHighlight: function (data = this.currentShow) {
    const lastPlayedS = this.getLastPlayedSeason(data);
    const cards = document.querySelectorAll(".si-season-card");
    cards.forEach((c) =>
      c.classList.toggle(
        "selected",
        lastPlayedS !== null &&
          parseInt(c.dataset.seasonNum, 10) === lastPlayedS,
      ),
    );
  },
  resolveHistoryDisplayEp: function (item, showData = null) {
    if (!item) return { isSpecial: false, season: 1, ep: 1, label: "S1 E1" };
    const rawS = parseInt(item.last_season, 10) || 1;
    const rawE = parseInt(item.last_episode, 10) || 1;
    if (item.is_special || rawS === 0) {
      return {
        isSpecial: true,
        season: rawS,
        ep: rawE,
        label: item.last_ep_name || "E" + rawE,
      };
    }
    const idStr = String(item.id || "");
    const sData =
      showData ||
      (this.currentShow && String(this.currentShow.id) === idStr
        ? this.currentShow
        : null) ||
      (this.getShowDetailsCache
        ? this.getShowDetailsCache("tv_" + idStr)?.data ||
          this.getShowDetailsCache(idStr)?.data
        : null);
    const animeInfo =
      (this.getShowAnimeInfo ? this.getShowAnimeInfo(idStr) : null) ||
      (this.animeCache
        ? this.animeCache[idStr + "_s1"] || this.animeCache[idStr]
        : null);
    const seqChain = animeInfo?.sequelChain || null;
    const tmdbSeasons = (sData?.seasons || []).filter(
      (s) =>
        s &&
        (s.season_number > 0 || (s.season && s.season > 0)) &&
        (!this.isSeasonAired || this.isSeasonAired(s)),
    );
    if (
      seqChain &&
      seqChain.length > 1 &&
      (!sData?.seasons || tmdbSeasons.length <= 1)
    ) {
      const res = this.resolveAnimeSequelEp(rawE, seqChain);
      if (res && res.season && res.ep) {
        return {
          isSpecial: false,
          season: res.season,
          ep: res.ep,
          label: "S" + res.season + " E" + res.ep,
        };
      }
    }
    if (item.last_disp_season && item.last_disp_ep) {
      return {
        isSpecial: false,
        season: item.last_disp_season,
        ep: item.last_disp_ep,
        label: "S" + item.last_disp_season + " E" + item.last_disp_ep,
      };
    }
    if (typeof this.getEpisodeHistory === "function") {
      const epHist = this.getEpisodeHistory();
      const group = Array.isArray(epHist)
        ? epHist.find((g) => String(g.id) === idStr)
        : null;
      const epHit =
        group && Array.isArray(group.episodes)
          ? group.episodes.find(
              (ep) => Number(ep.s) === rawS && Number(ep.e) === rawE,
            )
          : null;
      if (epHit && epHit.dispS && epHit.dispE) {
        return {
          isSpecial: false,
          season: epHit.dispS,
          ep: epHit.dispE,
          label: "S" + epHit.dispS + " E" + epHit.dispE,
        };
      }
    }
    return {
      isSpecial: false,
      season: rawS,
      ep: rawE,
      label: "S" + rawS + " E" + rawE,
    };
  },
  updateShowinfoPlayBtn: function () {
    const playBtn = this.$g("si-play-btn");
    if (!playBtn || !this.currentShow) return;
    const data = this.currentShow;
    const id = data.id;
    const type = data.media_type || (data.seasons ? "tv" : "movie") || "tv";
    const hist = this.getHistory();
    const showInHist = hist.find(
      (x) =>
        String(x.id) === String(id) ||
        (data.id && String(x.id) === String(data.id)),
    );
    const applyResumeBar = (pct) => {
      const hasPct = pct > 0;
      playBtn.classList.toggle("has-resume-progress", hasPct);
      if (hasPct) playBtn.style.setProperty("--resume-pct", pct + "%");
      else playBtn.style.removeProperty("--resume-pct");
    };
    if (type === "movie") {
      const movieInHist =
        showInHist ||
        hist.find(
          (x) =>
            String(x.id) === String(id) ||
            (data && String(x.id) === String(data.id)),
        );
      const movieLbl = movieInHist ? "Resume Movie" : "Play Movie";
      const movieSvg = movieInHist
        ? PAUSE_BTN_SVG(17, 17)
        : PLAY_BTN_SVG(17, 17);
      playBtn.innerHTML = movieSvg + "<span>" + movieLbl + "</span>";
      const moviePct =
        movieInHist && typeof this.getWatchProgressPercent === "function"
          ? this.getWatchProgressPercent(id, "movie", null, null, data)
          : 0;
      applyResumeBar(moviePct);
      playBtn.onclick = () => app.openWatch(id, type, 1, 1);
      return;
    }
    if (type === "tv") {
      const rawTmdbSeasons = (data.seasons || []).filter(
        (s) =>
          s &&
          (s.season_number > 0 || (s.season && s.season > 0)) &&
          (!this.isSeasonAired || this.isSeasonAired(s)),
      );
      const validSeasons =
        rawTmdbSeasons.length > 0
          ? rawTmdbSeasons
          : (this.currentShowSeasonList || []).filter(
              (s) => s && (s.season_number > 0 || (s.season && s.season > 0)),
            );
      if (
        showInHist &&
        showInHist.last_season !== undefined &&
        showInHist.last_season !== null
      ) {
        const isSpecial = Boolean(
          showInHist.is_special ||
          showInHist.last_season === 0 ||
          (showInHist.last_hybrid_season &&
            (this.currentShowSeasonList || []).some(
              (s) =>
                s.season_number === showInHist.last_hybrid_season &&
                (s._isSpecialGroup ||
                  s._isSpecial ||
                  s.format === "SPECIAL" ||
                  s.format === "OVA"),
            )),
        );
        let resumeLabel = "";
        if (isSpecial) {
          const epName =
            showInHist.last_ep_name ||
            this.episodeCache?.[
              `${data.id}_s${showInHist.last_season}`
            ]?.episodes?.find(
              (e) => e.episode_number === showInHist.last_episode,
            )?.name ||
            "E" + showInHist.last_episode;
          resumeLabel = "Resume " + epName;
        } else {
          const dispInfo = this.resolveHistoryDisplayEp(showInHist, data);
          resumeLabel = "Resume " + dispInfo.label;
        }
        playBtn.innerHTML =
          PAUSE_BTN_SVG(17, 17) + "<span>" + resumeLabel + "</span>";
        const tvPct =
          typeof this.getWatchProgressPercent === "function"
            ? this.getWatchProgressPercent(
                id,
                "tv",
                showInHist.last_season,
                showInHist.last_episode,
                data,
              )
            : 0;
        applyResumeBar(tvPct);
        playBtn.onclick = () => {
          const anchorY =
            typeof this.getSeasonAnchorY === "function"
              ? this.getSeasonAnchorY()
              : 0;
          if (anchorY > 0) {
            this.siSeasonScrollY = anchorY;
            if (!this.showSeasonScrollY) this.showSeasonScrollY = {};
            this.showSeasonScrollY[id] = anchorY;
          }
          app.openWatch(
            id,
            type,
            showInHist.last_season,
            showInHist.last_episode,
            true,
            false,
            showInHist.last_hybrid_season || this.showSeasons[id] || null,
          );
        };
      } else {
        playBtn.innerHTML = PLAY_BTN_SVG(17, 17) + "<span>Play</span>";
        applyResumeBar(0);
        playBtn.onclick = () => {
          const firstSeason =
            validSeasons[0]?.season_number ||
            data.seasons?.find((s) => s.season_number > 0)?.season_number ||
            1;
          const anchorY =
            typeof this.getSeasonAnchorY === "function"
              ? this.getSeasonAnchorY()
              : 0;
          if (anchorY > 0) {
            this.siSeasonScrollY = anchorY;
            if (!this.showSeasonScrollY) this.showSeasonScrollY = {};
            this.showSeasonScrollY[id] = anchorY;
          }
          app.openWatch(id, type, firstSeason, 1);
        };
      }
    }
  },
});
