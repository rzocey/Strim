var app = window.app || {};
Object.assign(app, {
	currentView: '',
	myList: {},
	customLists: [],
	myListSub: 'hub',
	historySub: 'titles',
	activeCustomListId: null,
	activePopoverShowId: null,
	watchedList: {},
	movieMediaCache: {},
	homeShowcaseCache: null,
	exploreSets: null,
	showEpPages: {},
	uiPrefs: {
		showBackdrop: true,
		titleLogo: true,
		similarShowcase: true,
		cwWideCard: true,
		randomHome: true,
		showcaseLimit: 20,
		turnOffAutoSlide: false,
		turnOffAnim: false,
		backdropQuality: 'high',
		posterQuality: 'high',
		logoQuality: 'high'
	},
	sanitizeSimilarList(arr) {
		return Array.isArray(arr) ? arr.slice(0, 30).map(i => this.sanitizeCardItem(i)) : arr;
	},
	parseCompNetRule(cn) {
		if (!cn) return null;
		if (cn.startsWith('comp_')) return {
			type: 'comp',
			id: cn.replace('comp_', '')
		};
		if (cn.startsWith('net_')) return {
			type: 'net',
			id: cn.replace('net_', '')
		};
		if (cn.startsWith('prov_')) {
			const rawProv = cn.replace('prov_', '');
			return {
				type: 'prov',
				ids: rawProv.split(',').filter(Boolean)
			};
		}
		if (cn.startsWith('plat_')) {
			const legacyMap = {
				netflix: '8',
				max: '1899',
				hulu: '15',
				disney: '337',
				prime: '9',
				apple: '350',
				paramount: '2303',
				peacock: '386',
				crunchyroll: '283'
			};
			const pId = legacyMap[cn.replace('plat_', '')];
			return pId ? {
				type: 'prov',
				ids: [pId]
			} : null;
		}
		return {
			type: 'raw',
			id: String(cn)
		};
	},
	preloadBg(path, onLoadCb, onErrCb) {
		if (!path || typeof onLoadCb !== 'function') return;
		const pre = new Image();
		let done = false;
		const finish = (fn, val) => {
			if (done) return;
			done = true;
			if (typeof fn === 'function') fn(val);
		};
		pre.onload = () => finish(onLoadCb, pre.src);
		pre.onerror = () => finish(onErrCb, null);
		pre.src = this.getImg(path, 'backdrop');
		if (pre.complete && pre.naturalWidth > 0) finish(onLoadCb, pre.src);
	},
	hidePageReloadOverlay() {
		if (document.documentElement.classList.contains('page-reloading')) {
			document.documentElement.classList.remove('page-reloading');
		}
		const el = this.$g('page-reload-overlay');
		if (el) el.style.display = 'none';
	},
	forceScrollTop(aggressive = false) {
		window.scrollTo({
			top: 0,
			left: 0,
			behavior: 'instant'
		});
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		if (aggressive) {
			requestAnimationFrame(() => {
				this.forceScrollTop(false);
				requestAnimationFrame(() => this.forceScrollTop(false));
			});
			setTimeout(() => this.forceScrollTop(false), 50);
			setTimeout(() => this.forceScrollTop(false), 150);
		}
	},
	getScrollY() {
		return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || (document.scrollingElement && document.scrollingElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
	},
	restoreScroll(targetY) {
		if (!targetY || targetY <= 0) return;
		const apply = () => {
			window.scrollTo({
				top: targetY,
				left: 0,
				behavior: 'instant'
			});
			document.documentElement.scrollTop = targetY;
			document.body.scrollTop = targetY;
			if (document.scrollingElement) document.scrollingElement.scrollTop = targetY;
		};
		apply();
		requestAnimationFrame(apply);
		setTimeout(apply, 30);
		setTimeout(apply, 100);
		setTimeout(apply, 250);
	},
	cacheMap: {
		ani: 'aniCache',
		anime: 'animeCache',
		tmdb: 'tmdbCache',
		show: 'showDetailsCache',
		episode: 'episodeCache',
		omdb: 'omdbRatingsCache',
		card: 'cardItemCache',
		similar: 'similarCache'
	},
	dirtyCaches: new Set(),
	flushPersistentCache(type) {
		const prop = this.cacheMap[type];
		if (!prop || !this[prop]) return;
		const source = this[prop];
		const keys = Object.keys(source);
		const cfg = (this.cacheCaps && this.cacheCaps[type]) || {
			session: 50,
			local: 30
		};
		if (keys.length > cfg.session * 2) {
			const drop = keys.slice(0, keys.length - (cfg.session * 2));
			for (let i = 0; i < drop.length; i++) delete source[drop[i]];
		}
		const sanitizeItem = (item) => {
			if (type === 'episode') return this.sanitizeEpisodeSeason(item);
			if (type === 'show') return this.sanitizeShowDetails(item);
			if (type === 'similar') return this.sanitizeSimilarList(item);
			if (type === 'card') return this.sanitizeCardItem(item);
			return item;
		};
		const buildSlice = (n) => Object.fromEntries(keys.slice(-n).map(k => [k, sanitizeItem(source[k])]));
		const rawSess = this.packCacheRaw(buildSlice(cfg.session));
		try {
			sessionStorage.setItem(`str_c_${type}`, rawSess);
		} catch (e) {}
		const rawLocal = this.packCacheRaw(buildSlice(cfg.local));
		this.$storeSetRaw(`str_c_${type}`, rawLocal);
	},
	loadUiPrefs() {
		const data = this.$storeGet('ui_preferences');
		if (data) {
			this.uiPrefs = {
				...this.uiPrefs,
				...data
			};
			this.uiPrefs.randomHome = true;
			this.uiPrefs.showcaseLimit = 20;
		}
		this.applyUiPrefs();
	},
	applyUiPrefs() {
		document.body.classList.toggle('disable-animations', !!this.uiPrefs.turnOffAnim);
		this.applyShowinfoBackdropPref(!this.uiPrefs || this.uiPrefs.showBackdrop !== false);
		[
			['pref-show-backdrop', 'showBackdrop'],
			['pref-title-logo', 'titleLogo'],
			['pref-similar-showcase', 'similarShowcase'],
			['pref-cw-wide-card', 'cwWideCard'],
			['pref-turn-off-auto-slide', 'turnOffAutoSlide'],
			['pref-turn-off-anim', 'turnOffAnim']
		].forEach(([id, prop]) => {
			const el = this.$g(id);
			if (el) el.checked = !!this.uiPrefs[prop];
		});
		[
			['pref-backdrop-quality', 'backdropQuality', 'high'],
			['pref-poster-quality', 'posterQuality', 'high'],
			['pref-logo-quality', 'logoQuality', 'high']
		].forEach(([id, prop, def]) => {
			const el = this.$g(id);
			if (el) el.value = this.uiPrefs[prop] || def;
		});
	},
	applyShowinfoBackdropPref(showBd) {
		const v = this.$g('view-showinfo');
		const siHero = this.$g('si-hero');
		const siBg = this.$g('si-bg');
		const siBlur = this.$g('si-blur-bg');
		if (this.siHeroTimer) {
			clearInterval(this.siHeroTimer);
			this.siHeroTimer = null;
		}
		const allBds = (this.currentShow?.images?.backdrops || []).filter(b => b.file_path);
		const tlBds = allBds.filter(b => (!b.iso_639_1 || b.iso_639_1 === 'xx'));
		const effectiveBds = tlBds.length > 0 ? tlBds : allBds;
		let siBds = effectiveBds.length > 0 ? effectiveBds.map(b => b.file_path) : (this.currentShow?.backdrop_path ? [this.currentShow.backdrop_path] : []);
		const active = Boolean(showBd && siBds.length > 0);
		if (v) v.classList.toggle('no-backdrop', !active);
		document.body.classList.toggle('showinfo-no-backdrop', !active);
		if (!active) {
			if (siHero) siHero.style.opacity = '0';
			if (siBg) {
				siBg.style.backgroundImage = 'none';
				siBg.style.opacity = '0';
			}
			if (siBlur) {
				siBlur.style.backgroundImage = 'none';
				siBlur.style.opacity = '0';
			}
		} else {
			if (siHero) siHero.style.opacity = '1';
			if (this.currentShow && this.currentView === 'showinfo') {
				const reqId = this.siReqId;
				const pre = new Image();
				pre.src = this.getImg(siBds[0], 'backdrop');
				pre.onload = () => {
					if (reqId !== this.siReqId || this.currentView !== 'showinfo') return;
					const bgUrl = "url('" + pre.src + "')";
					if (siBg) {
						siBg.style.backgroundImage = bgUrl;
						siBg.style.opacity = '1';
					}
					if (siBlur) {
						siBlur.style.backgroundImage = bgUrl;
						siBlur.style.opacity = '1';
					}
				};
				if (siBds.length > 1) {
					let sIdx = 0;
					this.siHeroTimer = setInterval(() => {
						if (reqId !== this.siReqId || this.currentView !== 'showinfo') {
							clearInterval(this.siHeroTimer);
							this.siHeroTimer = null;
							return;
						}
						sIdx = (sIdx + 1) % siBds.length;
						const nextImg = new Image();
						nextImg.src = this.getImg(siBds[sIdx], 'backdrop');
						nextImg.onload = () => {
							if (reqId !== this.siReqId || this.currentView !== 'showinfo') return;
							if (siBg) siBg.style.opacity = '0.2';
							if (siBlur) siBlur.style.opacity = '0.2';
							setTimeout(() => {
								if (reqId !== this.siReqId || this.currentView !== 'showinfo') return;
								const nextBgUrl = "url('" + nextImg.src + "')";
								if (siBg) {
									siBg.style.backgroundImage = nextBgUrl;
									siBg.style.opacity = '1';
								}
								if (siBlur) {
									siBlur.style.backgroundImage = nextBgUrl;
									siBlur.style.opacity = '1';
								}
							}, 200);
						};
					}, 7000);
				}
			}
		}
		if (this.currentView === 'showinfo') {
			setTimeout(() => {
				if (this.currentView === 'showinfo') this.fitShowinfoMeta();
			}, 460);
		}
	},
	updatePref(key, val) {
		this.uiPrefs[key] = val;
		this.$storeSet('ui_preferences', this.uiPrefs);
		this.applyUiPrefs();
		if (key === 'turnOffAutoSlide') {
			if (val) this.stopRowAutoSlide();
			else if (this.currentView === 'home') this.startRowAutoSlide();
		} else if (key === 'backdropQuality' || key === 'logoQuality' || key === 'posterQuality') {
			this.updateActiveImageQualities(key);
		} else if (key === 'showBackdrop') {
			this.applyShowinfoBackdropPref(val);
		} else if (key === 'cwWideCard') {
			this.updateContinueWatching();
		} else if (key === 'titleLogo' || key === 'similarShowcase') {
			if (this.currentView === 'showinfo' && this.currentShow) {
				this.openShowinfo(this.currentShow.id, this.currentShow.media_type || 'movie', false, false);
			} else if (this.currentView === 'home' && key === 'titleLogo') {
				if (this.heroItems && this.heroItems.length > 0) this.setHero(this.heroIdx);
			}
		}
	},
	swapImageTargets(elements, tmdbSize, aniSize = null) {
		(elements || []).forEach(el => {
			if (!el) return;
			if (el.tagName === 'IMG') {
				const src = el.getAttribute('src') || el.src || '';
				if (!src) return;
				if (src.includes('image.tmdb.org/t/p/') && tmdbSize) {
					const next = src.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${tmdbSize}/`);
					if (next !== src) el.src = next;
				} else if (src.includes('anilist.co/file/anilistcdn/media/anime/cover/') && aniSize) {
					const next = src.replace(/\/cover\/(medium|large|extraLarge)\//, `/cover/${aniSize}/`);
					if (next !== src) el.src = next;
				}
			} else if (el.style && el.style.backgroundImage) {
				const bg = el.style.backgroundImage;
				if (bg.includes('image.tmdb.org/t/p/') && tmdbSize) {
					el.style.backgroundImage = bg.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${tmdbSize}/`);
				} else if (bg.includes('anilist.co/file/anilistcdn/media/anime/cover/') && aniSize) {
					el.style.backgroundImage = bg.replace(/\/cover\/(medium|large|extraLarge)\//, `/cover/${aniSize}/`);
				}
			}
		});
	},
	updateActiveImageQualities(key) {
		const bq = this.uiPrefs?.backdropQuality || 'high';
		const pq = this.uiPrefs?.posterQuality || 'high';
		const lq = this.uiPrefs?.logoQuality || 'high';
		const posterTmdb = this.getImageSize('poster', pq);
		const stillTmdb = this.getImageSize('still', pq);
		const backdropTmdb = this.getImageSize('backdrop', bq);
		const logoTmdb = this.getImageSize('logo', lq);
		const aniCover = this.getImageSize('ani', pq);
		if (key === 'posterQuality') {
			const posterImgs = Array.from(document.querySelectorAll('img')).filter(img => !img.classList.contains('title-logo') && !img.classList.contains('hero-title-logo') && !img.classList.contains('showinfo-title-logo') && !img.closest('#hero-title, #si-title, #si-media-grid, #si-ep-grid'));
			this.swapImageTargets(posterImgs, posterTmdb, aniCover);
			this.swapImageTargets(document.querySelectorAll('#si-ep-grid img'), stillTmdb);
			const bgTargets = Array.from(document.querySelectorAll('.mylist-collage-item, .explore-collage-item, .si-season-card, [style*="image.tmdb.org/t/p/"], [style*="anilistcdn/media/anime/cover/"]')).filter(el => el.tagName !== 'IMG' && el.id !== 'hero-bg' && el.id !== 'hero-blur-bg' && el.id !== 'si-hero' && !el.classList.contains('showinfo-hero'));
			this.swapImageTargets(bgTargets, posterTmdb, aniCover);
			if (this.currentView === 'showinfo' && this.currentShow) {
				const p = this.$g('si-poster');
				const tlPoster = this.currentShow.images?.posters?.find(x => (!x.iso_639_1 || x.iso_639_1 === 'xx') && x.file_path);
				const chosenPoster = tlPoster?.file_path || this.currentShow.images?.posters?.find(x => x.iso_639_1 === 'en' && x.file_path)?.file_path || this.currentShow.poster_path;
				if (p && chosenPoster) p.src = this.getImg(chosenPoster, 'poster');
				if (this.currentEpisodes && this.currentEpisodes.length > 0) {
					const curSeason = parseInt(this.showSeasons[this.currentShow.id], 10) || 1;
					const curPage = (this.showEpPages && this.showEpPages[`${this.currentShow.id}_${curSeason}`]) || 1;
					this.renderEpisodePage(curSeason, curPage);
				}
			}
		} else if (key === 'backdropQuality') {
			const bdEls = ['hero-bg', 'hero-blur-bg', 'si-hero'].map(id => this.$g(id)).filter(Boolean);
			this.swapImageTargets(bdEls, backdropTmdb);
			this.swapImageTargets(document.querySelectorAll('.showinfo-hero, #si-media-grid img'), backdropTmdb);
			if (this.currentView === 'home' && this.heroItems && this.heroItems[this.heroIdx]?.backdrop_path) {
				const hPath = this.heroItems[this.heroIdx].backdrop_path;
				const hBg = this.$g('hero-bg');
				const hBlur = this.$g('hero-blur-bg');
				const pre = new Image();
				pre.src = this.getImg(hPath, 'backdrop');
				pre.onload = () => {
					if (this.currentView === 'home') {
						if (hBg) hBg.style.backgroundImage = `url('${pre.src}')`;
						if (hBlur) hBlur.style.backgroundImage = `url('${pre.src}')`;
					}
				};
			}
			if (this.currentView === 'showinfo' && this.currentShow) {
				const allBds = (this.currentShow.images?.backdrops || []).filter(b => b.file_path);
				const tlBds = allBds.filter(b => (!b.iso_639_1 || b.iso_639_1 === 'xx'));
				const effectiveBds = tlBds.length > 0 ? tlBds : allBds;
				const path = (effectiveBds.length > 0 ? effectiveBds[0].file_path : null) || this.currentShow.backdrop_path;
				const siHero = this.$g('si-hero');
				if (siHero && path) {
					const pre = new Image();
					pre.src = this.getImg(path, 'backdrop');
					pre.onload = () => {
						if (this.currentView === 'showinfo' && siHero) siHero.style.backgroundImage = `url('${pre.src}')`;
					};
				}
			}
		} else if (key === 'logoQuality') {
			if (this.currentView === 'home' && this.heroItems && this.heroItems[this.heroIdx]?.logo_path) {
				const lImg = document.querySelector('#hero-title .title-logo, #hero-title img');
				if (lImg) lImg.src = this.getImg(this.heroItems[this.heroIdx].logo_path, 'logo');
			}
			this.swapImageTargets(document.querySelectorAll('.title-logo, .hero-title-logo, .showinfo-title-logo, #hero-title img, #si-title img'), logoTmdb);
			if (this.currentView === 'showinfo' && this.currentShow) {
				const lImg = document.querySelector('#si-title .title-logo, #si-title img');
				const logos = this.currentShow.images?.logos || [];
				const l = logos.find(x => x.iso_639_1 === 'en') || logos.find(x => !x.iso_639_1) || logos[0];
				if (lImg && l?.file_path) lImg.src = this.getImg(l.file_path, 'logo');
			}
		}
	},
	toggleOptionsSheet() {
		this.collapseSideNav();
		const el = this.$g('options-sheet-overlay');
		if (!el) return;
		if (el.classList.contains('active')) {
			this.closeOptionsSheet();
			return;
		}
		el.classList.add('active');
		document.body.classList.add('modal-open');
		const curSt = window.history.state || {};
		window.history.pushState({
			...curSt,
			modal: 'options_sheet',
			view: this.currentView
		}, '', window.location.href);
	},
	syncModalOpen() {
		if (!document.querySelector('.sheet-overlay.active, .custom-prompt-overlay.active, #trailer-modal.active, #lucky-modal.active, #media-lightbox-modal.active, #storage-modal.active, #customize-modal.active, #about-modal.active')) {
			document.body.classList.remove('modal-open');
		}
	},
	closeOptionsSheet(e, fromPopState = false) {
		if (e && e.target && e.target.id !== 'options-sheet-overlay' && !e.target.classList.contains('sheet-close-btn') && !e.target.closest('.sheet-close-btn')) return;
		const el = this.$g('options-sheet-overlay');
		if (!el || !el.classList.contains('active')) return;
		if (!fromPopState && window.history.state && window.history.state.modal === 'options_sheet') {
			window.history.back();
			return;
		}
		el.classList.remove('active');
		this.syncModalOpen();
	},
	openOption(target) {
		const el = this.$g('options-sheet-overlay');
		if (el) el.classList.remove('active');
		if (['customize', 'storage', 'about'].includes(target)) {
			this.toggleAppModal(target, true);
			return;
		}
		this.syncModalOpen();
		if (target === 'history' || target === 'browsing' || target === 'blocklist') {
			if (window.history.state && window.history.state.modal === 'options_sheet') {
				const curSt = window.history.state || {};
				const {
					modal,
					...cleanSt
				} = curSt;
				window.history.replaceState({
					...cleanSt,
					view: cleanSt.view || this.currentView
				}, document.title, window.location.href);
			}
			this.navigate(target);
		}
	},
	toggleAppModal(name, open, e = null, fromPopState = false) {
		const modalId = `${name}-modal`;
		if (!open) {
			if (name === 'trailer' && e && e.target && !e.target.classList.contains('trailer-close-btn') && !e.target.closest('.trailer-close-btn')) return;
			if (e && e.target && e.target.id !== modalId && !e.target.classList.contains('trailer-close-btn') && !e.target.closest('.trailer-close-btn') && !e.target.classList.contains('sheet-close-btn') && !e.target.closest('.sheet-close-btn')) return;
			const el = this.$g(modalId);
			if (!el || !el.classList.contains('active')) return;
			if (name === 'trailer') {
				const wrap = el ? el.querySelector('.trailer-iframe-wrapper') : null;
				if (this.trailerTimer) {
					clearTimeout(this.trailerTimer);
					this.trailerTimer = null;
				}
				if (wrap) wrap.innerHTML = '<div class="dots-loader" id="trailer-loader" style="display:none;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><iframe id="trailer-iframe" src="about:blank" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
			}
			if (!fromPopState && window.history.state && window.history.state.modal === name) {
				window.history.back();
				return;
			}
			el.classList.remove('active');
			this.syncModalOpen();
			return;
		}
		if (name === 'customize') this.applyUiPrefs();
		if (name === 'storage') this.updateStorageStats();
		const el = this.$g(modalId);
		if (el) el.classList.add('active');
		document.body.classList.add('modal-open');
		const curSt = window.history.state || {};
		if (curSt.modal === 'options_sheet') {
			window.history.replaceState({
				...curSt,
				modal: name,
				view: curSt.view || this.currentView
			}, document.title, window.location.href);
		} else if (!curSt.modal || curSt.modal !== name) {
			window.history.pushState({
				...curSt,
				modal: name,
				view: curSt.view || this.currentView
			}, '', window.location.href);
		}
	},
	setActiveView(viewId, navKey = null) {
		document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
		const targetEl = this.$g(`view-${viewId}`);
		if (targetEl) targetEl.classList.add('active');
		if (viewId !== 'explore') {
			document.body.classList.remove('explore-hub-open');
			document.documentElement.classList.remove('explore-hub-open');
		}
		if (viewId !== 'mylist') {
			document.body.classList.remove('mylist-hub-open');
			document.documentElement.classList.remove('mylist-hub-open');
		}
		const btns = document.querySelectorAll('.nav-btn');
		btns.forEach(btn => btn.classList.remove('active'));
		if (navKey !== null) {
			const btnMap = {
				'home': 0,
				'explore': 1,
				'mylist': 2,
				'search': 3
			};
			const idx = btnMap[navKey];
			if (idx !== undefined && btns[idx]) btns[idx].classList.add('active');
		}
	},
	switchHeaderAnimation: function(activeEl, switchEl, onSwitch, targetActiveEl = null, targetSwitchEl = null) {
		if (!activeEl || !switchEl || this._isHeaderSwitching) {
			if (typeof onSwitch === 'function') onSwitch();
			return;
		}
		this._isHeaderSwitching = true;
		const parent = switchEl.parentElement;
		const fadeBtnOutEl = (parent && parent.id === 'explore-switch-tabs') ? parent : switchEl;
		activeEl.classList.add('title-switch-fade-out');
		fadeBtnOutEl.classList.add('title-switch-fade-out');
		setTimeout(() => {
			if (typeof onSwitch === 'function') onSwitch();
			const destActiveEl = targetActiveEl || activeEl;
			const destSwitchEl = targetSwitchEl || switchEl;
			const destParent = destSwitchEl.parentElement;
			const fadeBtnInEl = (destParent && destParent.id === 'explore-switch-tabs') ? destParent : destSwitchEl;
			activeEl.classList.remove('title-switch-fade-out');
			fadeBtnOutEl.classList.remove('title-switch-fade-out');
			destActiveEl.classList.add('title-switch-fade-in');
			fadeBtnInEl.classList.add('title-switch-fade-in');
			setTimeout(() => {
				destActiveEl.classList.remove('title-switch-fade-in');
				fadeBtnInEl.classList.remove('title-switch-fade-in');
				this._isHeaderSwitching = false;
			}, 160);
		}, 160);
	},
	switchExploreType(nextType = null, el = null) {
		const prevType = this.exploreType || 'movie';
		const targetType = nextType || (prevType === 'movie' ? 'tv' : 'movie');
		if (targetType === prevType) return;
		const sEl = el || this.$g('explore-switch-' + targetType);
		if (sEl) sEl.blur();
		const tEl = this.$g('explore-title');
		const destSwitchEl = this.$g('explore-switch-' + prevType);
		this.switchHeaderAnimation(tEl, sEl, () => {
			this.selectExploreCategory(targetType);
		}, tEl, destSwitchEl);
	},
	homeScrollPos: 0,
	searchScrollPos: 0,
	personScrollPos: 0,
	sourceScrollPos: 0,
	heroReqId: 0,
	autoNextTriggered: false,
	fsTimer: null,
	tmdbLangMap: null,
	fetchTmdbLanguages: async function() {
		if (this.tmdbLangMap) return this.tmdbLangMap;
		await this.fetchLanguages();
		return this.tmdbLangMap || {};
	},
	getLanguageName: function(code) {
		if (!code) return '';
		const c = String(code).toLowerCase().trim();
		if (this.tmdbLangMap && this.tmdbLangMap[c]) return this.tmdbLangMap[c];
		try {
			if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
				const dn = new Intl.DisplayNames(['en'], {
					type: 'language'
				});
				const res = dn.of(c);
				if (res && res.toLowerCase() !== c) return res;
			}
		} catch (e) {}
		return c.toUpperCase();
	},
	flushMetaCache() {
		if (!this.saveMetaTimer) return;
		clearTimeout(this.saveMetaTimer);
		this.saveMetaTimer = null;
		const pruneSub = (map, limit) => {
			if (!map) return {};
			const keys = Object.keys(map);
			if (keys.length <= limit) return map;
			const out = {};
			for (let i = keys.length - limit; i < keys.length; i++) out[keys[i]] = map[keys[i]];
			return out;
		};
		['ratingCache', 'starRatingCache', 'countryCache', 'tvTypeCache', 'logoCache', 'compNetCache'].forEach(k => {
			this[k] = pruneSub(this[k], 900);
		});
		const compactCompNet = {};
		for (const k in this.compNetCache) {
			const v = this.compNetCache[k];
			if (v) {
				compactCompNet[k] = {
					c: (v.comps || []).join(','),
					n: (v.nets || []).join(','),
					p: (v.provs || []).join(',')
				};
			}
		}
		this.$storeSet('meta_details_cache', {
			rating: this.ratingCache || {},
			starRating: this.starRatingCache || {},
			compNet: compactCompNet,
			country: this.countryCache || {},
			tvType: this.tvTypeCache || {},
			logo: this.logoCache || {}
		});
	},
	async fetchMetaItem(id, type, key) {
		try {
			let data = (this.getShowDetailsCache(`${type}_${id}`)?.data || this.getShowDetailsCache(id)?.data) || null;
			if (!data) {
				data = await this.api(`/${type}/${id}`, {
					append_to_response: 'release_dates,content_ratings,watch/providers,external_ids'
				});
			}
			if (!data) return;
			if (type === 'tv' && data.type) {
				this.tvTypeCache[key] = data.type;
				const formattedType = this.formatSeriesType(data.type, 'card');
				document.querySelectorAll(`.badge-type-${type}-${id}`).forEach(el => {
					el.textContent = formattedType;
				});
			}
			let c = (data.origin_country && data.origin_country.length > 0 && data.origin_country[0]) || (data.production_countries && data.production_countries.length > 0 && data.production_countries[0].iso_3166_1) || '';
			if (c === 'GB') c = 'UK';
			if (c) {
				this.countryCache[key] = c;
				document.querySelectorAll(`.badge-ctry-${type}-${id}`).forEach(el => {
					el.innerHTML = `<span class="card-meta-dot">&bull;</span><span>${c}</span>`;
					el.style.display = 'inline';
				});
			}
			this.cacheShowMeta(data, type, id);
			const unifiedRating = await this.resolveStarRating(data, type);
			if (unifiedRating) {
				document.querySelectorAll(`.badge-rate-${type}-${id}`).forEach(el => {
					el.textContent = unifiedRating;
					el.parentElement.style.display = 'inline-flex';
				});
			}
			if (this.isBlocked(data, type)) {
				document.querySelectorAll(`.poster-card[data-show-id="${id}"]`).forEach(el => el.remove());
				if (this.currentView === 'search' && !this.similarSearch) {
					const remainingCards = document.querySelectorAll('#search-grid .poster-card').length;
					if (remainingCards === 0) {
						const grid = this.$g('search-grid');
						if (grid) grid.innerHTML = (this.lastSearchQuery && this.lastSearchQuery.trim().length >= 2) ? '<div class="msg-box">No results found.</div>' : '';
						if (this.lastSearchQuery && this.lastSearchQuery.trim().length >= 2) this.checkSearchSuggestion(this.lastSearchQuery);
					}
				}
			}
		} catch (e) {} finally {
			if (this.metaPending) this.metaPending.delete(key);
		}
	},
	async init() {
		if ('scrollRestoration' in history) {
			try {
				history.scrollRestoration = 'manual';
			} catch (e) {}
		}
		document.querySelectorAll('.btn-clear-action').forEach(b => b.innerHTML = TRASH_SVG);
		this.renderStaticIcons();
		let parsed = this.$storeGet('mySavedList', {});
		this.myList = Array.isArray(parsed) ? {} : parsed;
		let clParsed = this.$storeGet('sh_custom_lists', []);
		this.customLists = Array.isArray(clParsed) ? clParsed : [];
		[
			['watchedList', 'sh_watched_list', {}],
			['epHistory', 'sh_ep_history', []],
			['blocklist', 'sh_blocklist', []],
			['catBlocklist', 'sh_cat_blocklist', []],
			['showSeasons', 'showSeasons', {}],
			['showEpPages', 'showEpPages', {}],
			['explorePrefs', 'explorePrefs', {
				movie: {},
				tv: {}
			}],
			['collapsedHistoryShows', 'collapsedHistoryShows', {}]
		].forEach(([prop, key, def]) => {
			this[prop] = this.$storeGet(key, def);
		});
		this.deadIds = new Set(this.$storeGet('sh_dead_ids', []));
		this.seasonViewMode = this.$storeGet('seasonViewMode', null) || (this.$storeGet('antiSpoiler', false) ? 'list' : 'grid');
		this.antiSpoiler = (this.seasonViewMode === 'list');
		this.epHistoryViewMode = this.$storeGet('epHistoryViewMode', 'grid');
		this.applySeasonViewMode();
		this.loadUiPrefs();
		let prefType = this.$storeGet('preferredType', 'embed') || 'embed';
		let prefPlayer = this.$storeGet('preferredPlayer', '1') || '1';
		const selType = this.$g('w-player-type-sel');
		if (selType) selType.value = prefType;
		this.updatePlayerDropdown(prefType, prefPlayer);
		this.setupScrollEvents();
		this.setupSearch();
		this.setupPlayerListeners();
		this.setupFsTimer();
		this.setupCardPeekTouch();
		this.setupUniversalTouchHover();
		this.renderRecentSearches();
		this.resetSearchInput();
		this.setupImageFade();
		this.setupScrollRowArrows();
		this.applyNavPosition();
		this.setupNavDrag();
		this.setupMinNavIdle();
		window.addEventListener('resize', () => {
			this.updateArrows();
			const isPort = window.matchMedia('(orientation: portrait)').matches;
			if (this.lastPort !== isPort) {
				this.applyNavPosition(false);
			}
			if (this.currentView === 'showinfo') this.fitShowinfoMeta();
		});
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') this.flushAllPersistentCaches();
			if (document.visibilityState === 'visible' && this.currentView === 'home') {
				this.startRowAutoSlide();
				this.startHeroTimer();
			}
		});
		window.addEventListener('orientationchange', () => {
			setTimeout(() => this.applyNavPosition(false), 120);
			if (this.currentView === 'showinfo') setTimeout(() => this.fitShowinfoMeta(), 150);
		});
		document.addEventListener('click', (e) => {
			const nav = document.querySelector('.glass-nav');
			if (!nav || nav.classList.contains('is-minimized') || nav.classList.contains('nav-collapsing')) return;
			if (!nav.classList.contains('pos-mid-left') && !nav.classList.contains('pos-mid-right')) return;
			if (!e.target.closest('.glass-nav')) {
				this.collapseSideNav();
			}
		}, true);
		window.addEventListener('blur', () => this.collapseSideNav());
		document.addEventListener('fullscreenchange', () => this.collapseSideNav());
		window.addEventListener('popstate', (e) => {
			const activeModals = [
				['custom-prompt', () => this.closeCustomPrompt(null, true)],
				['media-lightbox-modal', () => this.closeMediaLightbox(null, true)],
				['lucky-modal', () => this.cancelLucky(true)],
				['trailer-modal', () => this.closeTrailer(null, true)],
				['storage-modal', () => this.toggleAppModal('storage', false, null, true)],
				['customize-modal', () => this.toggleAppModal('customize', false, null, true)],
				['about-modal', () => this.toggleAppModal('about', false, null, true)],
				['options-sheet-overlay', () => this.closeOptionsSheet(null, true)]
			];
			for (const [id, closeFn] of activeModals) {
				const m = this.$g(id);
				if (m && m.classList.contains('active')) {
					closeFn();
					return;
				}
			}
			if (this.currentView === 'watch') {
				this.resetPlayerIframe();
				const showId = this.watchState.id || (this.currentShow && this.currentShow.id);
				const showType = this.watchState.type || (this.currentShow && (this.currentShow.media_type || this.currentShow.type)) || 'tv';
				this.watchFromEpHistory = false;
				this.blockWatchOnBack = true;
				const isTv = Boolean(showType === 'tv' || (this.currentShow && (this.currentShow.media_type === 'tv' || this.currentShow.type === 'tv')));
				if (showId && (!e.state || e.state.view !== 'showinfo' || String(e.state.id) !== String(showId))) {
					this.openShowinfo(showId, showType, true, false, isTv, isTv);
					return;
				}
				this.scrollDownOnReturnToShowinfo = isTv;
				this.scrollOverlayOnReturnToShowinfo = isTv;
				if (isTv) this.showSiScrollOverlay(true);
			}
			if (this.blockWatchOnBack && e.state && e.state.view === 'watch') {
				window.history.back();
				return;
			}
			this.blockWatchOnBack = false;
			if (!e.state || e.state.view !== 'showinfo') {
				const info = this.$g('si-infobox');
				if (info) info.innerHTML = '';
			}
			if (e.state) {
				if (e.state.view === 'showinfo') {
					document.body.classList.remove('explore-hub-open', 'mylist-hub-open');
					document.documentElement.classList.remove('explore-hub-open', 'mylist-hub-open');
					const isReturningToEpisodes = Boolean(e.state.sub === 'episodes');
					const shouldScroll = isReturningToEpisodes && Boolean(this.scrollDownOnReturnToShowinfo);
					const shouldOverlay = isReturningToEpisodes && Boolean(this.scrollOverlayOnReturnToShowinfo);
					this.scrollDownOnReturnToShowinfo = false;
					this.scrollOverlayOnReturnToShowinfo = false;
					if (!isReturningToEpisodes) {
						this.showSiScrollOverlay(false);
					}
					const isSameShow = (this.currentShow && String(this.currentShow.id) === String(e.state.id));
					if (isSameShow && this.currentShowSeasonList && this.currentShowSeasonList.length > 0) {
						this.currentView = 'showinfo';
						this.setActiveView('showinfo', null);
						this.updateBackBtn('showinfo');
						this.updateShowinfoPlayBtn();
						this.updateSeasonCardsHighlight();
						if (!e.state.sub) {
							this.showSiScrollOverlay(false);
							this.showSeasonSelector(true);
							return;
						}
						if (e.state.sub === 'episodes' && e.state.season) {
							this.selectSeasonCard(e.state.season, shouldScroll, shouldOverlay);
							return;
						}
					}
					this.openShowinfo(e.state.id, e.state.type, false, false, shouldScroll, shouldOverlay);
				} else if (e.state.view === 'watch') this.openWatch(e.state.id, e.state.type, e.state.season, e.state.episode, false);
				else if (e.state.view === 'movies') this.selectExploreCategory('movie', false, true);
				else if (e.state.view === 'shows' || e.state.view === 'series') this.selectExploreCategory('tv', false, true);
				else if (e.state.view === 'people') this.selectExploreCategory('person', false, true);
				else if (e.state.view === 'companies') this.selectExploreCategory('company', false, true);
				else if (e.state.view === 'explore' && e.state.sub) this.selectExploreCategory(e.state.sub, false, true);
				else if (e.state.view === 'explore') {
					this.navigate('explore', false);
					this.showExploreHub(false);
				} else if (e.state.view === 'mylist') {
					this.closeAddToListPopover();
					this.navigate('mylist', false);
					this.openMyListSub(e.state.sub || 'hub', e.state.listId || null, false);
				} else if (e.state.view === 'history') {
					this.navigate('history', false);
					this.openHistorySub(e.state.sub || 'titles', false);
				} else if (e.state.view === 'person') {
					this.openPerson(e.state.id, false, false, e.state.dept || 'Acting');
				} else if (e.state.view === 'source') {
					this.openSource(e.state.id, e.state.type || 'company', '', false, false);
				} else this.navigate(e.state.view, false);
			} else {
				this.navigate('home', false);
			}
		});
		document.addEventListener('click', (e) => {
			const epPanel = this.$g('w-ep-panel');
			const srvPanel = this.$g('w-server-panel');
			const container = this.$g('global-player-container');
			let changed = false;
			[
				['#w-ep-panel', '#w-menu-btn', epPanel],
				['#w-server-panel', '#w-gear-btn', srvPanel]
			].forEach(([panelSel, btnSel, panelEl]) => {
				if (!e.target.closest(panelSel) && !e.target.closest(btnSel) && panelEl && panelEl.classList.contains('active')) {
					panelEl.classList.remove('active');
					changed = true;
				}
			});
			if (changed && !epPanel.classList.contains('active') && !srvPanel.classList.contains('active')) {
				container.classList.remove('ui-locked');
			}
			document.querySelectorAll('.comp-net-wrap').forEach(w => {
				if (!w.contains(e.target)) {
					const d = w.querySelector('.comp-net-dropdown');
					if (d) {
						d.style.display = 'none';
						d.style.minWidth = '';
						d.style.width = '';
					}
				}
			});
			if (!e.target.closest('.rating-hint-btn') && !e.target.closest('.vote-fluctuate-msg') && !e.target.closest('.ep-vote-fluctuate-msg')) {
				document.querySelectorAll('.vote-fluctuate-msg.active, .ep-vote-fluctuate-msg.active').forEach(el => el.classList.remove('active'));
				document.querySelectorAll('.rating-hint-btn.active').forEach(el => el.classList.remove('active'));
			}
			const popover = this.$g('add-to-list-popover');
			if (popover && popover.style.display !== 'none' && !popover.contains(e.target) && !e.target.closest('.bookmark-btn') && !e.target.closest('#si-bookmark-btn')) {
				this.closeAddToListPopover();
			}
		});
		window.addEventListener('scroll', () => {
			if (this.activePopoverOpenTime && (Date.now() - this.activePopoverOpenTime < 100)) return;
			if (this.$g('add-to-list-popover')?.style.display !== 'none') this.closeAddToListPopover();
		}, {
			passive: true,
			capture: true
		});
		window.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this.$g('add-to-list-popover')?.style.display !== 'none') this.closeAddToListPopover();
			if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
				const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
				if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !e.target?.isContentEditable) {
					const watchView = this.$g('view-watch');
					if (watchView && watchView.classList.contains('active')) {
						e.preventDefault();
						this.toggleFullscreen();
					}
				}
			}
		});
		window.addEventListener('resize', () => {
			document.querySelectorAll('.comp-net-dropdown').forEach(d => {
				if (d.style.display === 'block') this.adjustDropPosition(d);
			});
		}, {
			passive: true
		});
		['input', 'focusout'].forEach(evt => {
			document.addEventListener(evt, (e) => {
				if (e.target && e.target.classList.contains('filter-multi-input')) {
					this.syncMultiInputUI(e.target);
				}
			});
		});
		this.initPersistentCaches();
		this.initMetaCache();
		this.fetchTmdbLanguages();
		this.fetchGenres();
		this.fetchCountries();
		this.fetchLanguages();
		this.parseUrlOnLoad();
		setTimeout(() => this.hidePageReloadOverlay(), 3500);
	},
	parseUrlOnLoad: function() {
		const params = new URLSearchParams(window.location.search);
		let view = params.get('view') || 'home';
		if (view === 'home' || view === 'search') {
			this.hidePageReloadOverlay();
		}
		if (view === 'series') {
			view = 'shows';
			window.history.replaceState({
				view: 'shows'
			}, 'Shows', '?view=shows');
		}
		if (view === 'showinfo') {
			const id = params.get('id');
			const type = params.get('type');
			if (id && type) {
				this.openShowinfo(id, type, true, true);
				return;
			}
		} else if (view === 'watch') {
			const id = params.get('id');
			const type = params.get('type');
			const s = params.get('season') || 1;
			const e = params.get('episode') || 1;
			if (id && type) {
				this.openWatch(id, type, s, e, true, true);
				return;
			}
		} else if (view === 'person') {
			const id = params.get('id');
			const dept = params.get('dept') || 'Acting';
			if (id) {
				this.openPerson(id, true, true, dept);
				return;
			}
		} else if (view === 'source') {
			const id = params.get('id');
			const type = params.get('type') || 'company';
			if (id) {
				this.openSource(id, type, '', true, true);
				return;
			}
		}
		if (view === 'mylist') {
			const sub = params.get('sub') || 'hub';
			const listId = params.get('listId') || null;
			this.navigate('mylist', true, true);
			this.openMyListSub(sub, listId, false);
			return;
		}
		if (view === 'history') {
			const sub = params.get('sub') || 'titles';
			this.navigate('history', true, true);
			this.openHistorySub(sub, false);
			return;
		}
		this.navigate(view, true, true);
	},
	hidePageReloadOverlay: function() {
		if (document.documentElement.classList.contains('page-reloading')) {
			document.documentElement.classList.remove('page-reloading');
		}
		const el = this.$g('page-reload-overlay');
		if (el) el.style.display = 'none';
	},
	captureLeavingViewState(nextViewId) {
		if (this.currentView === 'explore' && nextViewId !== 'explore' && typeof this.advanceExploreCollageSets === 'function') {
			this.advanceExploreCollageSets();
		}
		if (this.currentView === 'mylist' && nextViewId !== 'mylist' && typeof this.advanceMyListCollageSets === 'function') {
			this.advanceMyListCollageSets();
		}
		if (this.currentView === 'home' && nextViewId !== 'home') {
			this.homeScrollPos = this.getScrollY();
		}
		if (this.currentView === 'search' && nextViewId !== 'search') {
			const sY = this.getScrollY();
			if (this.similarSearch) {
				this.similarScrollPos = sY;
			} else {
				this.searchScrollPos = sY;
			}
			this.saveRecentSearch();
			if (nextViewId !== 'showinfo') this.clearSearch('main');
		}
		if (this.currentView === 'person' && nextViewId === 'showinfo') {
			this.personScrollPos = this.getScrollY();
		}
		if (this.currentView === 'source' && nextViewId === 'showinfo') {
			this.sourceScrollPos = this.getScrollY();
		}
	},
	navigate: function(viewId, pushState = true, replaceState = false) {
		if (pushState) this.blockWatchOnBack = false;
		if (viewId !== 'watch') this._hasInAppPrev = true;
		if (viewId !== 'explore') {
			document.body.classList.remove('explore-hub-open');
			document.documentElement.classList.remove('explore-hub-open');
		}
		if (viewId !== 'mylist') {
			document.body.classList.remove('mylist-hub-open');
			document.documentElement.classList.remove('mylist-hub-open');
		}
		if (viewId !== 'blocklist') {
			const cbm = this.$g('cat-block-menu');
			if (cbm) cbm.style.display = 'none';
		}
		if (viewId !== 'home') this.stopRowAutoSlide();
		if (viewId !== 'showinfo') {
			const info = this.$g('si-infobox');
			if (info) info.innerHTML = '';
			const cRow = this.$g('si-cast-row');
			if (cRow) cRow.scrollLeft = 0;
		}
		if (viewId !== 'search' && viewId !== 'showinfo' && viewId !== 'watch') {
			if (this.similarSearch) {
				this.similarSearch = null;
				this.similarScrollPos = 0;
				const wrapEl = this.$g('similar-search-badge-wrap');
				if (wrapEl) wrapEl.style.display = 'none';
				const syWrap = this.$g('search-year-sort-wrap');
				if (syWrap) syWrap.style.display = 'none';
				const inp = this.$g('search-input');
				if (inp) inp.style.display = '';
				const goBtn = document.querySelector('#view-search .btn-search-go');
				if (goBtn) goBtn.style.display = '';
			}
		}
		this.captureLeavingViewState(viewId);
		if (viewId === 'home' && pushState) {
			this.homeScrollPos = 0;
		}
		if (viewId === 'search' && pushState && !this.openingSimilarSearch) {
			this.searchScrollPos = 0;
			this.clearSearch('main');
		}
		clearInterval(this.siHeroTimer);
		if (this.currentView === 'watch' && viewId !== 'watch') {
			this.resetPlayerIframe();
		}
		if (viewId !== 'movies' && viewId !== 'shows' && viewId !== 'series' && viewId !== 'people' && viewId !== 'companies' && viewId !== 'showinfo') {
			this.returnFromShowinfoToExplore = false;
		}
		let targetView = viewId;
		if (viewId === 'movies' || viewId === 'shows' || viewId === 'series' || viewId === 'people' || viewId === 'companies') targetView = 'explore';
		this.setActiveView(targetView, viewId);
		const isReturningSimilar = (viewId === 'search' && !pushState && this.similarSearch && this.similarScrollPos > 0);
		const isReturningSearch = (viewId === 'search' && !pushState && !this.similarSearch && this.searchScrollPos > 0);
		const isReturningHome = (viewId === 'home' && !pushState && this.homeScrollPos > 0);
		if (!isReturningSimilar && !isReturningSearch && !isReturningHome) {
			window.scrollTo({
				top: 0,
				left: 0,
				behavior: 'instant'
			});
			document.documentElement.scrollTop = 0;
			document.body.scrollTop = 0;
		}
		this.currentView = viewId;
		this.updateBackBtn(viewId);
		const pageTitle = {
			explore: 'Explore',
			movies: 'Movies',
			shows: 'Shows',
			series: 'Shows',
			people: 'People',
			companies: 'Companies',
			search: 'Search',
			mylist: 'My List',
			markedaswatched: 'Watched',
			blocklist: 'Block List',
			history: 'Watch History',
			browsing: 'Browsing History'
		} [viewId] || 'Home';
		this.syncHistoryUrl({
			view: viewId
		}, pageTitle, `?view=${viewId}`, pushState, replaceState);
		if (viewId === 'home') {
			if (!this.homeLoaded) {
				this.loadHome();
			} else {
				this.updateContinueWatching();
				this.startRowAutoSlide();
				this.startHeroTimer();
				if (!pushState && this.homeScrollPos > 0) {
					this.restoreScroll(this.homeScrollPos);
				}
			}
		} else if (viewId === 'explore') {
			this.showExploreHub();
		} else if (viewId === 'movies') {
			this.selectExploreCategory('movie', false, !pushState);
		} else if (viewId === 'shows' || viewId === 'series') {
			this.selectExploreCategory('tv', false, !pushState);
		} else if (viewId === 'people') {
			this.selectExploreCategory('person', false, !pushState);
		} else if (viewId === 'companies') {
			this.selectExploreCategory('company', false, !pushState);
		} else if (viewId === 'mylist') {
			if (pushState) {
				this.myListSub = 'hub';
				this.activeCustomListId = null;
			}
			this.loadMyList();
		} else if (viewId === 'markedaswatched') {
			this.loadMarkedAsWatch();
		} else if (viewId === 'blocklist') {
			this.$g('block-search-input').value = '';
			this.$g('block-search-section').style.display = 'none';
			if (this.$g('block-clear-btn')) this.$g('block-clear-btn').style.display = 'none';
			const cbm = this.$g('cat-block-menu');
			if (cbm) cbm.style.display = 'none';
			this.loadBlockList();
		} else if (viewId === 'search') {
			if (this.similarSearch) {
				this.syncSimilarSearchHeader();
				const recentsEl = this.$g('search-recents');
				if (recentsEl) {
					recentsEl.innerHTML = '';
					recentsEl.style.display = 'none';
				}
				const inp = this.$g('search-input');
				if (inp) inp.value = '';
				this.renderSimilarSearchResults();
				this.toggleClearBtn('search-input', 'main-clear-btn');
				this.updateSearchFilterBar();
				this.resetSearchYearSort();
				if (!pushState && this.similarScrollPos > 0) {
					this.restoreScroll(this.similarScrollPos);
				}
			} else {
				this.restorePreviousSearchState(!pushState);
			}
			if (pushState && !this.similarSearch) this.$g('search-input')?.focus();
		} else if (viewId === 'history' || viewId === 'browsing') {
			if (viewId === 'history') {
				if (pushState) this.historySub = 'titles';
				this.openHistorySub(this.historySub || 'titles', false);
			} else {
				this.loadHistoryView('browsing');
			}
		}
	},
	toggleClearBtn: function(inpId, btnId) {
		const btn = this.$g(btnId);
		const inp = this.$g(inpId);
		if (btn) btn.style.display = (inp && inp.value && inp.value.length > 0) ? 'inline-flex' : 'none';
	},
	updateSearchFilterBar: function() {
		const inp = this.$g('search-input');
		const fb = this.$g('search-filter-bar');
		if (fb) fb.style.display = (inp && inp.value.trim().length > 0) ? 'flex' : 'none';
	},
	clearSearch: function(target) {
		if (target === 'main') {
			const inp = this.$g('search-input');
			this.resetSearchInput(false);
			this.renderRecentSearches();
			if (inp) inp.focus();
		} else if (target === 'block') {
			this.$g('block-search-input').value = '';
			this.toggleClearBtn('block-search-input', 'block-clear-btn');
			this.$g('block-search-section').style.display = 'none';
			this.$g('block-search-input').focus();
		}
	},
	goBack: function() {
		const bBtn = this.$g('global-back-btn');
		if (bBtn) bBtn.blur();
		const cp = this.$g('custom-prompt');
		if (cp && cp.classList.contains('active')) {
			this.closeCustomPrompt(null, false);
			return;
		}
		const ml = this.$g('media-lightbox-modal');
		if (ml && ml.classList.contains('active')) {
			this.closeMediaLightbox();
			return;
		}
		const tm = this.$g('trailer-modal');
		if (tm && tm.classList.contains('active')) {
			this.closeTrailer(null, false);
			return;
		}
		const info = this.$g('si-infobox');
		if (info) info.innerHTML = '';
		if (this.currentView === 'search') {
			this.saveRecentSearch();
			this.resetSearchInput();
		}
		if (this.currentView === 'watch') {
			this.playerGoBack();
			return;
		}
		if (this.currentView === 'showinfo') {
			const epSec = this.$g('si-episodes-section');
			const seasonsSec = this.$g('si-seasons-section');
			const hasSeasons = Boolean(this.currentShowSeasonList && this.currentShowSeasonList.length > 0);
			if (hasSeasons && epSec && epSec.style.display !== 'none' && seasonsSec && seasonsSec.style.display === 'none') {
				if (window.history.state && window.history.state.sub === 'episodes') {
					window.history.back();
				} else {
					this.showSeasonSelector(false);
				}
				return;
			}
		}
		window.history.back();
	},
	showCustomPrompt: function(type, payload = null) {
		const modal = this.$g('custom-prompt');
		const msg = this.$g('custom-prompt-msg');
		const btn = this.$g('custom-prompt-confirm-btn');
		const clearWatched = {
			m: "Clear all marked watched items?",
			fn: () => {
				app.watchedList = {};
				app.$storeSet('sh_watched_list', app.watchedList);
				app.loadMarkedAsWatch();
				document.querySelectorAll('.watched-badge').forEach(b => b.remove());
			}
		};
		const targetListName = payload ? (app.customLists.find(l => String(l.id) === String(payload))?.name || 'this list') : '';
		const currentTitle = this.currentShow?.title || this.currentShow?.name || '';
		const blockPromptMsg = currentTitle ?
			`Add "${currentTitle}" to Blocklist? Unblock anytime from Options → Blocklist.` :
			"Add to Blocklist? Unblock anytime from Options → Blocklist";
		const cfg = {
			mylist: {
				m: "Clear entire My List?",
				fn: () => {
					app.myList = {};
					app.$storeSet('mySavedList', app.myList);
					app.loadMyList();
				}
			},
			clear_bookmark: {
				m: "Clear all bookmarks?",
				fn: () => {
					app.myList = {};
					app.$storeSet('mySavedList', app.myList);
					app.openMyListSub('bookmark', null, false);
					app.syncAllCardStars();
				}
			},
			clear_custom_list: {
				m: `Clear all items in "${targetListName}"?`,
				fn: () => app.clearActiveCustomList(payload)
			},
			delete_custom_list: {
				m: `Delete "${targetListName}"?`,
				fn: () => app.deleteCustomList(payload)
			},
			history: {
				m: "Clear entire Watch History?",
				fn: () => {
					app.setHistory([]);
					app.setEpisodeHistory([]);
					app.collapsedHistoryShows = {};
					app.$storeSet('collapsedHistoryShows', app.collapsedHistoryShows);
					if (app.historySub === 'episodes') app.renderEpisodeHistory();
					else app.loadHistoryView('watch');
				}
			},
			browsing: {
				m: "Clear Browsing History?",
				fn: () => {
					app.setBrowsingHistory([]);
					app.loadHistoryView('browsing');
				}
			},
			block_current: {
				m: blockPromptMsg,
				fn: (skipGoBack) => app.executeBlockCurrentShow(skipGoBack)
			},
			markedaswatched: clearWatched,
			clear_cache: {
				m: "Clear all cached data? bookmarks, custom lists, watch history, and preferences will remain safe.",
				fn: () => {
					app.clearBrowserAndAppCaches(false);
					app.updateStorageStats();
					app.showToast('Data cache cleared.');
				}
			},
			reset_default: {
				m: "Reset everything? This will permanently erase all saved preferences, custom lists, watch history, and caches, returning the app to its default state.",
				fn: () => app.clearBrowserAndAppCaches(true)
			}
		} [type];
		if (!cfg) return;
		msg.innerText = cfg.m;
		btn.onclick = () => {
			const isBlock = (type === 'block_current');
			app.closeCustomPrompt(null, true);
			if (window.history.state && window.history.state.modal === 'custom_prompt') {
				window.history.go(isBlock ? -2 : -1);
			}
			cfg.fn(isBlock);
		};
		modal.classList.add('active');
		document.body.classList.add('modal-open');
		if (!window.history.state || window.history.state.modal !== 'custom_prompt') {
			window.history.pushState({
				modal: 'custom_prompt',
				view: this.currentView
			}, '', window.location.href);
		}
	},
	closeCustomPrompt: function(e = null, fromPop = false) {
		if (e && e.target && e.target.id !== 'custom-prompt') return;
		const cp = this.$g('custom-prompt');
		if (!cp || !cp.classList.contains('active')) return;
		if (!fromPop && window.history.state && window.history.state.modal === 'custom_prompt') {
			window.history.back();
			return;
		}
		cp.classList.remove('active');
		this.syncModalOpen();
	},
	getHistoryStore: function(type = 'watch') {
		return this.$storeGet(type === 'browsing' ? 'sh_browsing_history' : 'sh_history', []);
	},
	setHistoryStore: function(type, h) {
		this.$storeSet(type === 'browsing' ? 'sh_browsing_history' : 'sh_history', h);
	},
	getHistory: function() {
		return this.getHistoryStore('watch');
	},
	setHistory: function(h) {
		this.setHistoryStore('watch', h);
	},
	getBrowsingHistory: function() {
		return this.getHistoryStore('browsing');
	},
	setBrowsingHistory: function(h) {
		this.setHistoryStore('browsing', h);
	},
	loadHistoryView: function(type) {
		const isBrowsing = type === 'browsing';
		const hist = this.getHistoryStore(type);
		this.renderGridList(isBrowsing ? 'browsing-grid' : 'history-grid', isBrowsing ? 'clear-browsing-btn' : 'clear-history-btn', hist, `${isBrowsing ? 'Browsing' : 'Watch'} history is empty.`, isBrowsing ? 'browsing' : true);
	},
	removeFromHistoryStore: function(type, id) {
		const isBrowsing = type === 'browsing';
		const oldList = this.getHistoryStore(type);
		const removedItem = oldList.find(x => String(x.id) === String(id));
		let list = oldList.filter(x => String(x.id) !== String(id));
		this.setHistoryStore(type, list);
		if (!isBrowsing) {
			let epHist = this.getEpisodeHistory().filter(g => String(g.id) !== String(id));
			this.setEpisodeHistory(epHist);
			if (this.currentView === 'history' && this.historySub === 'episodes') {
				this.renderEpisodeHistory();
			}
		}
		if (this.currentView === (isBrowsing ? 'browsing' : 'history')) {
			if (isBrowsing || this.historySub === 'titles') this.loadHistoryView(type);
		} else if (!isBrowsing && this.currentView === 'home') this.updateContinueWatching();
		const title = removedItem ? (removedItem.title || removedItem.name) : '';
		const targetLabel = isBrowsing ? 'Browsing History' : 'Watch History';
		if (title) this.showToast(`<span class="toast-title">${title}</span> removed from ${targetLabel}`);
	},
	removeFromHistory: function(id) {
		this.removeFromHistoryStore('watch', id);
	},
	removeFromBrowsingHistory: function(id) {
		this.removeFromHistoryStore('browsing', id);
	},
	getEpisodeHistory: function() {
		return this.$storeGet('sh_ep_history', []);
	},
	setEpisodeHistory: function(h) {
		this.$storeSet('sh_ep_history', h);
	},
	switchHistorySub: function() {
		const sEl = this.$g('history-switch-title');
		if (sEl) sEl.blur();
		const tEl = this.$g('history-view-title');
		const nextSub = this.historySub === 'episodes' ? 'titles' : 'episodes';
		this.switchHeaderAnimation(tEl, sEl, () => {
			this.openHistorySub(nextSub, true);
		});
	},
	switchMyListSub: function() {
		const sEl = this.$g('mylist-watched-btn');
		if (sEl) sEl.blur();
		const tEl = this.$g('mylist-view-title');
		const targetEl = this.$g('markedaswatched-view-title');
		this.switchHeaderAnimation(tEl, sEl, () => {
			this.navigate('markedaswatched');
		}, targetEl, this.$g('markedaswatched-switch-title'));
	},
	switchWatchedSub: function() {
		const sEl = this.$g('markedaswatched-switch-title');
		if (sEl) sEl.blur();
		const tEl = this.$g('markedaswatched-view-title');
		const targetEl = this.$g('mylist-view-title');
		this.switchHeaderAnimation(tEl, sEl, () => {
			this.navigate('mylist');
		}, targetEl, this.$g('mylist-watched-btn'));
	},
	openHistorySub: function(sub = 'titles', pushState = true) {
		this.historySub = sub;
		const isEp = (sub === 'episodes');
		const titleEl = this.$g('history-view-title');
		const switchEl = this.$g('history-switch-title');
		const titlesGrid = this.$g('history-grid');
		const epList = this.$g('history-episodes-list');
		const clearBtn = this.$g('clear-history-btn');
		const toggleBtn = this.$g('history-ep-view-toggle');
		if (toggleBtn && !isEp) {
			toggleBtn.style.display = 'none';
		}
		if (titleEl) titleEl.innerText = isEp ? 'Episode History' : 'Watch History';
		if (switchEl) {
			switchEl.innerHTML = isEp ?
				'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' :
				'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V2M3 22v-1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1"/><rect width="18" height="10" x="3" y="7" rx="2"/></svg>';
			switchEl.title = isEp ? 'Titles' : 'Episodes';
		}
		if (isEp) {
			if (titlesGrid) titlesGrid.style.display = 'none';
			if (epList) epList.style.display = 'block';
			this.applySeasonViewMode();
			this.renderEpisodeHistory();
		} else {
			if (epList) epList.style.display = 'none';
			if (titlesGrid) titlesGrid.style.display = 'grid';
			this.loadHistoryView('watch');
		}
		const pageTitle = isEp ? 'Episode History' : 'Watch History';
		const url = isEp ? '?view=history&sub=episodes' : '?view=history';
		this.syncHistoryUrl({
			view: 'history',
			sub
		}, pageTitle, url, pushState);
		this.hidePageReloadOverlay();
	},
	renderEpisodeHistory: function() {
		const container = this.$g('history-episodes-list');
		const clearBtn = this.$g('clear-history-btn');
		const toggleBtn = this.$g('history-ep-view-toggle');
		if (!container) return;
		container.classList.toggle('list-view', (this.epHistoryViewMode === 'list' || this.epHistoryViewMode === 'min'));
		const epHist = this.getEpisodeHistory();
		const hasEps = Boolean(epHist && epHist.some(g => g.episodes && g.episodes.length > 0));
		if (!hasEps) {
			container.innerHTML = '<div class="msg-box">Episode history is empty.</div>';
			if (clearBtn) clearBtn.style.display = 'none';
			if (toggleBtn) toggleBtn.style.display = 'none';
			return;
		}
		if (clearBtn) clearBtn.style.display = 'inline-flex';
		if (toggleBtn) toggleBtn.style.display = 'inline-flex';
		let html = '';
		epHist.forEach(group => {
			if (!group.episodes || group.episodes.length === 0) return;
			const isCollapsed = Boolean(this.collapsedHistoryShows && this.collapsedHistoryShows[String(group.id)]);
			const showTitle = group.title || 'Show';
			const epsHtml = group.episodes.map(ep => {
				const hybridArg = (ep.hybridSeason !== null && ep.hybridSeason !== undefined) ? ep.hybridSeason : 'null';
				const cleanImg = ep.img || '';
				const safeTitle = (ep.title || '').replace(/"/g, '&quot;');
				const epText = ep.title || '';
				return '<div class="ep-card" onclick="app.watchFromEpHistory=true;app.openWatch(\'' + group.id + '\',\'tv\',' + ep.s + ',' + ep.e + ',true,false,' + hybridArg + ')">' +
					'<button type="button" class="history-ep-delete-btn" onclick="event.stopPropagation();app.removeEpisodeFromHistory(\'' + group.id + '\',' + ep.s + ',' + ep.e + ')" title="Remove Episode">&times;</button>' +
					'<div class="ep-thumb-wrap"><img src="' + cleanImg + '" class="ep-img" loading="lazy" onerror="this.style.opacity=\'0\'"></div>' +
					'<div class="ep-info"><div class="ep-title" title="' + safeTitle + '">' + epText + '</div></div>' +
					'</div>';
			}).join('');
			html += `<div class="history-ep-group${isCollapsed ? ' is-collapsed' : ''}" data-show-id="${group.id}"><div class="history-ep-group-header"><div class="history-ep-group-title" onclick="app.toggleShowGroupCollapse('${group.id}')" title="Click to ${isCollapsed ? 'expand' : 'collapse'}">${showTitle}</div><button type="button" class="history-group-delete-btn" onclick="event.stopPropagation();app.removeShowGroupFromEpisodeHistory('${group.id}')" title="Remove Show from History">&times;</button></div><div class="scroll-row-container"><div class="scroll-row history-ep-row" onscroll="app.checkScrollArrow(this)">${epsHtml}</div></div></div>`;
		});
		container.innerHTML = html;
		this.setupScrollRowArrows();
		this.updateArrows();
		this.markImgsLoaded(container.querySelectorAll('.ep-img'));
	},
	toggleHistoryEpViewMode: function() {
		const epHist = this.getEpisodeHistory();
		if (!epHist || epHist.length === 0) return;
		const prevMode = this.epHistoryViewMode || 'grid';
		const next = {
			grid: 'list',
			list: 'min',
			min: 'grid'
		} [prevMode] || 'grid';
		this.epHistoryViewMode = next;
		this.collapsedHistoryShows = next === 'min' ? Object.fromEntries(epHist.map(g => [String(g.id), true])) : {};
		this.$storeSet('epHistoryViewMode', next);
		this.$storeSet('collapsedHistoryShows', this.collapsedHistoryShows);
		const container = this.$g('history-episodes-list');
		const isNextList = (next === 'list' || next === 'min');
		const isPrevList = (prevMode === 'list' || prevMode === 'min');
		const applyFn = () => {
			this.applySeasonViewMode();
			if (container) {
				container.classList.toggle('list-view', isNextList);
				container.querySelectorAll('.history-ep-group').forEach(groupEl => {
					groupEl.classList.toggle('is-collapsed', next === 'min');
					const titleEl = groupEl.querySelector('.history-ep-group-title');
					if (titleEl) {
						titleEl.title = `Click to ${next === 'min' ? 'expand' : 'collapse'}`;
					}
				});
			}
		};
		const revertFn = () => {
			this.applySeasonViewMode();
			if (container) {
				container.classList.toggle('list-view', isPrevList);
				container.querySelectorAll('.history-ep-group').forEach(groupEl => {
					groupEl.classList.toggle('is-collapsed', prevMode === 'min');
					const titleEl = groupEl.querySelector('.history-ep-group-title');
					if (titleEl) {
						titleEl.title = `Click to ${prevMode === 'min' ? 'expand' : 'collapse'}`;
					}
				});
			}
		};
		this.animateHeight(container, applyFn, revertFn);
	},
	toggleShowGroupCollapse: function(showId) {
		if (!this.collapsedHistoryShows) this.collapsedHistoryShows = {};
		const sId = String(showId);
		const isNowCollapsed = !this.collapsedHistoryShows[sId];
		if (isNowCollapsed) {
			this.collapsedHistoryShows[sId] = true;
		} else {
			delete this.collapsedHistoryShows[sId];
		}
		this.$storeSet('collapsedHistoryShows', this.collapsedHistoryShows);
		const groupEl = document.querySelector(`.history-ep-group[data-show-id="${sId}"]`);
		if (groupEl) {
			const titleEl = groupEl.querySelector('.history-ep-group-title');
			if (titleEl) {
				titleEl.title = `Click to ${isNowCollapsed ? 'expand' : 'collapse'}`;
			}
			const applyFn = () => {
				groupEl.classList.toggle('is-collapsed', isNowCollapsed);
			};
			const revertFn = () => {
				groupEl.classList.toggle('is-collapsed', !isNowCollapsed);
			};
			this.animateHeight(groupEl, applyFn, revertFn);
		}
		this.updateArrows();
	},
	removeEpisodeFromHistory: function(showId, season, episode) {
		let epHist = this.getEpisodeHistory();
		const group = epHist.find(g => String(g.id) === String(showId));
		if (!group) return;
		const removedEp = group.episodes.find(e => Number(e.s) === Number(season) && Number(e.e) === Number(episode));
		group.episodes = group.episodes.filter(e => !(Number(e.s) === Number(season) && Number(e.e) === Number(episode)));
		if (group.episodes.length === 0) {
			return this.removeShowGroupFromEpisodeHistory(showId);
		}
		const epTitle = removedEp ? removedEp.title : `Episode ${episode}`;
		this.setEpisodeHistory(epHist);
		this.showToast(`<span class="toast-title">${group.title} (${epTitle})</span> removed from Watch History`);
		this.renderEpisodeHistory();
	},
	removeShowGroupFromEpisodeHistory: function(showId) {
		let epHist = this.getEpisodeHistory();
		const group = epHist.find(g => String(g.id) === String(showId));
		const showTitle = group ? group.title : 'Show';
		if (this.collapsedHistoryShows && this.collapsedHistoryShows[String(showId)]) {
			delete this.collapsedHistoryShows[String(showId)];
			this.$storeSet('collapsedHistoryShows', this.collapsedHistoryShows);
		}
		epHist = epHist.filter(g => String(g.id) !== String(showId));
		this.setEpisodeHistory(epHist);
		let mainHist = this.getHistory().filter(x => String(x.id) !== String(showId));
		this.setHistory(mainHist);
		if (this.currentView === 'home') this.updateContinueWatching();
		this.showToast(`<span class="toast-title">${showTitle}</span> removed from Watch History`);
		this.renderEpisodeHistory();
	},
	saveEpisodeHistory: function(showItem, season, episode, epObj, activeSpecialEp, isSpecialWatch, epName, hybridSeason, dispSeason, dispEp) {
		if (!showItem || !showItem.id) return;
		const id = String(showItem.id);
		const title = showItem.title || showItem.name || 'Show';
		const fallbackImg = showItem.poster_path ? this.getImg(showItem.poster_path, 'poster') : '';
		let img = epObj?.still_path ? this.getImg(epObj.still_path, 'still') : (activeSpecialEp?.still_path ? (activeSpecialEp.still_path.startsWith('http') ? activeSpecialEp.still_path : this.getImg(activeSpecialEp.still_path, 'still')) : fallbackImg);
		let date = '';
		if (epObj?.air_date) {
			const dObj = new Date(epObj.air_date);
			if (!isNaN(dObj.getTime())) {
				const day = dObj.getUTCDate();
				const month = dObj.toLocaleString('en-US', {
					month: 'short',
					timeZone: 'UTC'
				});
				const year = dObj.getUTCFullYear();
				date = `${day} ${month} ${year}`;
			}
		}
		const epRatingVal = (epObj?.vote_average > 0 ? epObj.vote_average.toFixed(1) : null);
		const epPrefix = isSpecialWatch ? `E${dispEp}` : `S${dispSeason} E${dispEp}`;
		const nameText = epName || epObj?.name || `Episode ${dispEp}`;
		const cardTitle = isSpecialWatch ? nameText : `${epPrefix} - ${nameText}`;
		let epHist = this.getEpisodeHistory();
		let groupIdx = epHist.findIndex(g => String(g.id) === id);
		let group;
		if (groupIdx > -1) {
			group = epHist.splice(groupIdx, 1)[0];
		} else {
			group = {
				id: id,
				title: title,
				type: 'tv',
				isAnime: Boolean(showItem.isAnime || showItem.is_anime || id.startsWith('ani_')),
				episodes: []
			};
		}
		group.title = title;
		group.episodes = (group.episodes || []).filter(e => !(Number(e.s) === Number(season) && Number(e.e) === Number(episode)));
		group.episodes.unshift({
			s: parseInt(season, 10),
			e: parseInt(episode, 10),
			dispS: dispSeason,
			dispE: dispEp,
			hybridSeason: hybridSeason || null,
			isSpecial: Boolean(isSpecialWatch),
			title: cardTitle,
			img: img,
			runtime: epObj?.runtime || null,
			date: date,
			rating: epRatingVal,
			desc: epObj?.overview || ''
		});
		if (group.episodes.length > 10) group.episodes = group.episodes.slice(0, 10);
		epHist.unshift(group);
		if (epHist.length > 35) epHist = epHist.slice(0, 35);
		this.setEpisodeHistory(epHist);
	},
	saveBrowsingHistory: function(item) {
		if (!item || !item.id) return;
		let h = this.getBrowsingHistory().filter(x => String(x.id) !== String(item.id));
		h.unshift(item);
		this.setBrowsingHistory(h.slice(0, 100));
	},
	triggerGlobalRefresh: function() {
		this.stopRowAutoSlide();
		this.homeLoaded = false;
		this.$storeRemove('cached_home_showcase');
		this.similarCache = {};
		this.$storeRemove('str_c_similar');
		this.$sessRemove('str_c_similar');
		this.$g('view-home')?.classList.remove('loaded');
		this.infiniteRows.forEach(id => {
			const el = this.$g(id);
			if (el) el.innerHTML = '';
		});
		this.$g('explore-grid').innerHTML = '';
		const mCol = this.$g('explore-movies-collage');
		const sCol = this.$g('explore-series-collage');
		if (mCol) mCol.innerHTML = '';
		if (sCol) sCol.innerHTML = '';
		this.heroItems = [];
		this.lastExploreType = '';
		if (this.currentView === 'home') this.loadHome(true);
		else if (this.currentView === 'explore') this.populateExploreHubPosters();
		else if (this.currentView === 'movies' || this.currentView === 'shows' || this.currentView === 'series' || this.currentView === 'people' || this.currentView === 'companies') this.resetExplore(true);
		else if (this.currentView === 'markedaswatched') this.loadMarkedAsWatch();
	},
	toggleCatBlockMenu: function() {
		const menu = this.$g('cat-block-menu');
		if (!menu) return;
		if (menu.style.display === 'none' || !menu.style.display) {
			menu.style.display = 'block';
			this.renderAllBlockFilterTags();
			this.updateTypeInputWidth('block');
		} else {
			menu.style.display = 'none';
		}
	},
	getBlockMultiList: function(key) {
		return this.getMultiList(key, 'block');
	},
	addBlockFilter: function(key, id, name) {
		this.addMultiFilter(key, id, name, '', 'block');
	},
	removeBlockFilter: function(key, id) {
		this.removeMultiFilter(key, id, 'block');
	},
	renderBlockFilterTags: function(key) {
		this.renderFilterTags(key, 'block');
	},
	renderAllBlockFilterTags: function() {
		this.renderAllFilterTags('block');
	},
	clearAllBlockCategoryInputs: function() {
		this.clearType('block');
		this.blockMulti = Object.fromEntries(this.blockKeys.map(k => [k, []]));
		this.updateGenre2Visibility();
		this.renderAllFilterTags('block');
		this.blockKeys.forEach(k => {
			const fk = this.getFieldKey(k);
			const inp = this.$g(`bc-${fk}-input`);
			if (inp) inp.value = '';
			const drop = this.$g(`bc-${fk}-drop`);
			if (drop) {
				drop.style.display = 'none';
				drop.innerHTML = '';
			}
		});
	},
	async addCatBlock() {
		const t = this.$g('bc-type')?.value || '',
			tName = this.$g('bc-type-input')?.value || '';
		const bKeys = this.blockRulePairs.map(([pl, s]) => [s, pl]);
		const lists = {},
			keys = {},
			rule = {
				type: t,
				personMediaIds: []
			};
		const labels = (t && t !== 'all') ? [tName || t] : [];
		let hasOtherCat = false;
		bKeys.forEach(([k, pl]) => {
			const list = this.getBlockMultiList(k);
			lists[k] = list;
			rule[pl] = list.map(x => x.id);
			keys[pl] = rule[pl].slice().sort().join(',');
			if (list.length > 0) {
				hasOtherCat = true;
				labels.push(list.map(x => x.name).join('/'));
			}
		});
		if (!hasOtherCat) return;
		rule.label = labels.join(', ');
		if (lists.person.length > 0) {
			try {
				for (let p of lists.person) {
					const cData = await this.api(`/person/${p.id}/combined_credits`);
					if (cData)[...(cData.cast || []), ...(cData.crew || [])].forEach(w => {
						if (w && w.id) rule.personMediaIds.push(w.id);
					});
				}
				rule.personMediaIds = [...new Set(rule.personMediaIds)];
			} catch (e) {}
		}
		const exists = this.catBlocklist.some(r => r.type === t && bKeys.every(([k, pl]) => this.toRuleArr(r[pl], r[k]).sort().join(',') === keys[pl]));
		if (!exists) {
			this.catBlocklist.push(rule);
			this.$storeSet('sh_cat_blocklist', this.catBlocklist);
		}
		this.clearAllBlockCategoryInputs();
		this.loadBlockList();
		this.triggerGlobalRefresh();
	},
	toggleBookmarkFromInfo: function(btnEl, e) {
		if (e && e.stopPropagation) e.stopPropagation();
		if (!this.currentShow) return;
		const btn = btnEl || this.$g('si-bookmark-btn');
		this.handleBookmarkBtnClick(this.toCardSummary(this.currentShow), btn);
	},
	toggleWatchedFromInfo: function() {
		if (!this.currentShow) return;
		const isW = this.toggleWatched(this.currentShow);
		this.showToast(isW ? 'Mark as Watched' : 'Mark as Unwatched');
		this.updateWatchedBtnUI();
	},
	updateWatchedBtnUI: function() {
		const btn = this.$g('si-watched-btn');
		if (!btn || !this.currentShow) return;
		const eqIds = this.getEquivalentIds(this.currentShow.id, this.currentShow);
		const isW = Array.from(eqIds).some(eid => Boolean(this.watchedList && this.watchedList[eid]));
		btn.innerHTML = isW ? EYE_SVG(20, 20, false) : EYE_SVG(20, 20, true);
		btn.style.color = isW ? '#4ade80' : 'white';
		btn.style.borderColor = isW ? '#4ade80' : 'rgba(255,255,255,0.3)';
		btn.classList.toggle('watched', isW);
	},
	saveHistory: function(item, season = null, episode = null, epName = null, isSpecial = false, hybridSeason = null) {
		let h = this.getHistory().filter(x => String(x.id) !== String(item.id));
		if (season !== null && season !== undefined) item.last_season = season;
		if (episode !== null && episode !== undefined) item.last_episode = episode;
		if (epName) item.last_ep_name = epName;
		if (isSpecial) item.is_special = true;
		if (hybridSeason !== null && hybridSeason !== undefined) item.last_hybrid_season = hybridSeason;
		h.unshift(item);
		this.setHistory(h.slice(0, 100));
	},
	searchYearSortOrder: null,
	resetSearchYearSort: function() {
		this.searchYearSortOrder = null;
		this.syncYearSortBtns('search-year-sort', null);
		const syWrap = this.$g('search-year-sort-wrap');
		if (syWrap) syWrap.style.display = 'none';
	},
	setSearchYearSort: function(order) {
		if (this.similarSearch) return;
		this.searchYearSortOrder = (this.searchYearSortOrder === order ? null : order);
		this.syncYearSortBtns('search-year-sort', this.searchYearSortOrder);
		const query = this.$g('search-input')?.value.trim();
		if (this.lastSearchQuery === query && this.lastSearchFullResults) {
			this.renderCurrentSearchResults(query);
			return;
		}
		if (query && query.length >= 2) this.executeSearch(query);
	},
	getCustomListEmptyHtml: function(listName) {
		const plusMock = '<span class="msg-box-btn-mock">' + PLUS_SVG(11, 11, 4) + '</span>';
		const starMock = `<span class="msg-box-btn-mock saved">${STAR_SVG(12, 12)}</span>`;
		return `<div class="msg-box-title">${listName || 'List'} is empty</div><div class="msg-box-sub">Add shows or movies using the ${plusMock} or ${starMock}</div>`;
	},
	renderGridList: function(gridId, btnId, items, emptyMsg, cardHistoryType) {
		const grid = this.$g(gridId);
		const btn = this.$g(btnId);
		if (!grid) return;
		if (items.length === 0) {
			grid.innerHTML = `<div class="msg-box">${emptyMsg}</div>`;
			if (btn) btn.style.display = 'none';
		} else {
			grid.innerHTML = items.map(i => this.buildCard(i, i.media_type, cardHistoryType)).join('');
			if (btn) btn.style.display = 'inline-flex';
		}
	},
	loadMyList: function() {
		this.openMyListSub(this.myListSub || 'hub', this.activeCustomListId || null, false);
	},
	openMyListSub: function(sub = 'hub', listId = null, pushState = true) {
		this.myListSub = sub;
		this.activeCustomListId = listId;
		const hubEl = this.$g('mylist-hub');
		const customHubEl = this.$g('mylist-custom-hub');
		const catalogWrapEl = this.$g('mylist-catalog-wrap');
		const titleEl = this.$g('mylist-view-title');
		const clearBtn = this.$g('clear-mylist-btn');
		const watchedBtn = this.$g('mylist-watched-btn');
		const renameBtn = this.$g('mylist-rename-btn');
		this.toggleRenameListInput(false);

		const targetList = (listId && (this.customLists || []).find(l => String(l.id) === String(listId))) || null;
		const listName = targetList ? targetList.name : 'Custom List';
		const listItems = targetList && targetList.items ? this.sortByAddedAt(Object.values(targetList.items)) : [];
		const bDetailRaw = (sub === 'bookmark') ? this.sortByAddedAt(Object.values(this.myList || {})) : [];
		const bDetailSeen = new Set();
		const bDetailSorted = bDetailRaw.filter(it => {
			if (!it) return false;
			const cKey = it.ani_id ? ('ani_' + it.ani_id) : (String(it.id).startsWith('ani_') ? String(it.id) : (this.animeCache?.[it.id]?.aniId ? ('ani_' + this.animeCache[it.id].aniId) : String(it.id)));
			if (bDetailSeen.has(cKey)) return false;
			bDetailSeen.add(cKey);
			return true;
		});

		let mode = 'hub';
		if (sub === 'bookmark') mode = 'bookmark';
		else if (sub === 'custom_hub' || (sub === 'custom' && !listId)) mode = 'custom_hub';
		else if ((sub === 'custom_detail' && listId) || (sub === 'custom' && listId)) mode = 'custom_detail';

		const configs = {
			bookmark: {
				hub: 'none',
				custom: 'none',
				catalog: 'block',
				title: 'Bookmark',
				watched: 'none',
				rename: 'none',
				clear: bDetailSorted.length > 0,
				page: 'Bookmark - My List',
				url: '?view=mylist&sub=bookmark'
			},
			custom_hub: {
				hub: 'none',
				custom: 'block',
				catalog: 'none',
				title: 'Custom List',
				watched: 'none',
				rename: 'none',
				clear: false,
				page: 'Custom List - My List',
				url: '?view=mylist&sub=custom'
			},
			custom_detail: {
				hub: 'none',
				custom: 'none',
				catalog: 'block',
				title: listName,
				watched: 'none',
				rename: 'inline-flex',
				clear: listItems.length > 0,
				page: `${listName} - My List`,
				url: `?view=mylist&sub=custom&listId=${listId}`
			},
			hub: {
				hub: 'grid',
				custom: 'none',
				catalog: 'none',
				title: 'My List',
				watched: 'inline-flex',
				rename: 'none',
				clear: false,
				page: 'My List',
				url: '?view=mylist'
			}
		};

		const cfg = configs[mode];
		this.myListSub = mode;
		if (mode === 'hub') this.activeCustomListId = null;

		const isHub = (mode === 'hub');
		document.body.classList.toggle('mylist-hub-open', isHub);
		document.documentElement.classList.toggle('mylist-hub-open', isHub);
		const navMyListBtn = document.querySelector('.glass-nav .nav-btn[onclick*="mylist"]') || document.querySelectorAll('.glass-nav .nav-btn')[2];
		if (navMyListBtn) navMyListBtn.classList.toggle('active', isHub);

		if (hubEl) hubEl.style.display = cfg.hub;
		if (customHubEl) customHubEl.style.display = cfg.custom;
		if (catalogWrapEl) catalogWrapEl.style.display = cfg.catalog;
		if (titleEl) titleEl.innerText = cfg.title;
		if (watchedBtn) watchedBtn.style.display = cfg.watched;
		if (renameBtn) renameBtn.style.display = cfg.rename;
		if (clearBtn) clearBtn.style.display = cfg.clear ? 'inline-flex' : 'none';

		if (mode === 'bookmark') {
			this.renderGridList('mylist-grid', 'clear-mylist-btn', bDetailSorted, 'Bookmark list is empty.', 'bookmark');
		} else if (mode === 'custom_hub') {
			this.toggleNewListInput(false);
			this.renderCustomListHub();
		} else if (mode === 'custom_detail') {
			this.renderGridList('mylist-grid', 'clear-mylist-btn', listItems, this.getCustomListEmptyHtml(listName), 'custom_list:' + listId);
		} else {
			this.renderMyListHub();
		}

		if (pushState) {
			this.syncHistoryUrl({
				view: 'mylist',
				sub: this.myListSub,
				listId: this.activeCustomListId
			}, cfg.page, cfg.url, true, false);
		} else {
			this.syncHistoryUrl({
				view: 'mylist',
				sub: this.myListSub,
				listId: this.activeCustomListId
			}, cfg.page, cfg.url, false, true);
		}
		this.hidePageReloadOverlay();
	},
	renderCollageHtml: function(items, maxCount = 6) {
		const list = (items || []).filter(i => i && i.poster_path).slice(0, maxCount);
		return list.map(it => `<div class="mylist-collage-item" style="background-image:url('${this.getImg(it.poster_path, 'poster')}');"></div>`).join('');
	},
	advanceMyListCollageSets: function() {
		this.myListCollageIdx = ((this.myListCollageIdx || 0) + 1) % 6;
	},
	getMyListPlaceholderUrls: async function(slotOffset = 0) {
		if (!this.exploreSets) this.exploreSets = this.$storeGet('str_c_exploresets_v5', null) || this.$sessGet('str_c_exploresets_v5', null);
		let pool = [];
		if (this.exploreSets && (this.exploreSets.movie?.length || this.exploreSets.tv?.length)) {
			const mFlat = (this.exploreSets.movie || []).flat();
			const sFlat = (this.exploreSets.tv || []).flat();
			const maxL = Math.max(mFlat.length, sFlat.length);
			for (let i = 0; i < maxL; i++) {
				if (mFlat[i]) pool.push(mFlat[i]);
				if (sFlat[i]) pool.push(sFlat[i]);
			}
		} else if (this._myListPlaceholderPool && this._myListPlaceholderPool.length >= 12) {
			pool = this._myListPlaceholderPool;
		} else {
			try {
				const [mRes, sRes] = await Promise.all([
					this.api('/discover/movie', {
						sort_by: 'revenue.desc',
						page: 1
					}).catch(() => ({
						results: []
					})),
					this.api('/discover/tv', {
						sort_by: 'vote_count.desc',
						page: 1
					}).catch(() => ({
						results: []
					}))
				]);
				const mUrls = (mRes?.results || []).filter(i => i && i.poster_path).map(i => this.getImg(i.poster_path, 'poster'));
				const sUrls = (sRes?.results || []).filter(i => i && i.poster_path).map(i => this.getImg(i.poster_path, 'poster'));
				const maxL = Math.max(mUrls.length, sUrls.length);
				for (let i = 0; i < maxL; i++) {
					if (mUrls[i]) pool.push(mUrls[i]);
					if (sUrls[i]) pool.push(sUrls[i]);
				}
				this._myListPlaceholderPool = pool;
			} catch (e) {}
		}
		if (pool.length === 0) return [];
		const uniq = [...new Set(pool)];
		const idx = this.myListCollageIdx || 0;
		const start = ((idx * 12) + (slotOffset * 6)) % uniq.length;
		const out = [];
		for (let i = 0; i < 6 && i < uniq.length; i++) {
			out.push(uniq[(start + i) % uniq.length]);
		}
		return out;
	},
	renderMyListHub: function() {
		const bCollage = this.$g('hub-collage-bookmark');
		if (bCollage) {
			const bRaw = Object.values(this.myList || {});
			const bSeen = new Set();
			const bDedup = this.sortByAddedAt(bRaw).filter(it => {
				if (!it || !it.poster_path) return false;
				const cKey = it.ani_id ? ('ani_' + it.ani_id) : (String(it.id).startsWith('ani_') ? String(it.id) : (this.animeCache?.[it.id]?.aniId ? ('ani_' + this.animeCache[it.id].aniId) : String(it.id)));
				if (bSeen.has(cKey)) return false;
				bSeen.add(cKey);
				return true;
			});
			const bItems = bDedup.slice(0, 6);
			const bCard = bCollage.closest('.mylist-hub-card');
			if (bItems.length > 0) {
				bCollage.innerHTML = this.renderCollageHtml(bItems);
				if (bCard) this.applyCardPosterBg(bCard, bItems[0].poster_path);
			} else {
				bCollage.innerHTML = '';
				if (bCard) bCard.style.backgroundColor = '';
				this.getMyListPlaceholderUrls(0).then(urls => {
					if (urls.length > 0 && Object.keys(this.myList || {}).length === 0) {
						bCollage.innerHTML = urls.map(u => `<div class="mylist-collage-item" style="background-image:url('${u}');"></div>`).join('');
					}
				});
			}
		}
		const cCollage = this.$g('hub-collage-custom');
		if (cCollage) {
			const watchedEntries = Object.values(this.watchedList || {}).filter(it => it && it.id && it.poster_path).map((it, itIdx) => ({
				item: it,
				time: (typeof it.addedAt === 'number' && it.addedAt > 0) ? it.addedAt : ((itIdx + 1) * 1000)
			}));
			const allCustom = (this.customLists || []).flatMap((cl, clIdx) => {
				const listTime = parseInt(String(cl.id).replace(/\D/g, ''), 10) || ((clIdx + 1) * 1000000);
				return Object.values(cl.items || {}).filter(it => it && it.id && it.poster_path).map((it, itIdx) => ({
					item: it,
					time: (typeof it.addedAt === 'number' && it.addedAt > 0) ? it.addedAt : (listTime + (itIdx + 1) * 1000)
				}));
			}).concat(watchedEntries).sort((a, b) => b.time - a.time);
			const seen = new Set();
			const cItems = [];
			for (const entry of allCustom) {
				const idKey = String(entry.item.id);
				if (!seen.has(idKey)) {
					seen.add(idKey);
					cItems.push(entry.item);
					if (cItems.length >= 6) break;
				}
			}
			const cCard = cCollage.closest('.mylist-hub-card');
			if (cItems.length > 0) {
				cCollage.innerHTML = this.renderCollageHtml(cItems);
				if (cCard) this.applyCardPosterBg(cCard, cItems[0].poster_path);
			} else {
				cCollage.innerHTML = '';
				if (cCard) cCard.style.backgroundColor = '';
				this.getMyListPlaceholderUrls(1).then(urls => {
					if (urls.length > 0 && cCollage.children.length === 0) {
						cCollage.innerHTML = urls.map(u => `<div class="mylist-collage-item" style="background-image:url('${u}');"></div>`).join('');
					}
				});
			}
		}
	},
	applyCardPosterBg: function(cardEl, posterPath) {
		if (!posterPath) return;
		if (cardEl) cardEl.style.transition = 'background-color 0.4s ease';
		if (!this._posterBgCache) this._posterBgCache = {};
		if (this._posterBgCache[posterPath]) {
			const cachedHex = this._posterBgCache[posterPath];
			if (cardEl) requestAnimationFrame(() => {
				cardEl.style.backgroundColor = cachedHex;
			});
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const c = document.createElement('canvas');
				c.width = 16;
				c.height = 16;
				const ctx = c.getContext('2d');
				ctx.drawImage(img, 0, 0, 16, 16);
				const d = ctx.getImageData(0, 0, 16, 16).data;
				let r = 0,
					g = 0,
					b = 0,
					cnt = 0;
				for (let i = 0; i < d.length; i += 4) {
					if (d[i + 3] > 20) {
						r += d[i];
						g += d[i + 1];
						b += d[i + 2];
						cnt++;
					}
				}
				if (cnt > 0) {
					const toHex = (v) => Math.max(0, Math.min(255, Math.round((v / cnt) * 0.75))).toString(16).padStart(2, '0');
					const hex = '#' + toHex(r) + toHex(g) + toHex(b);
					this._posterBgCache[posterPath] = hex;
					if (cardEl) cardEl.style.backgroundColor = hex;
				}
			} catch (e) {}
		};
		const srcUrl = this.getImg(posterPath, 'poster');
		img.src = srcUrl + (srcUrl.includes('?') ? '&' : '?') + 'cors=1';
	},
	renderCustomListHub: function() {
		const grid = this.$g('mylist-custom-grid');
		if (!grid) return;
		const watchedRaw = Object.values(this.watchedList || {});
		const watchedItems = this.sortByAddedAt(watchedRaw).filter(i => i && i.poster_path).slice(0, 6);
		const watchedCollage = watchedItems.length > 0 ? `<div class="mylist-card-collage">${this.renderCollageHtml(watchedItems)}</div><div class="mylist-card-overlay"></div>` : '';
		const watchedCard = `<div class="custom-list-card" onclick="app.navigate('markedaswatched')">${watchedCollage}<div class="custom-list-card-title">Watched</div></div>`;
		const customLists = this.customLists || [];
		const customItemsList = [];
		const customCards = customLists.map(cl => {
			const rawItems = Object.values(cl.items || {});
			const items = this.sortByAddedAt(rawItems).filter(i => i && i.poster_path).slice(0, 6);
			customItemsList.push(items);
			const collageHtml = items.length > 0 ? `<div class="mylist-card-collage">${this.renderCollageHtml(items)}</div><div class="mylist-card-overlay"></div>` : '';
			return `<div class="custom-list-card" onclick="app.openMyListSub('custom_detail', '${cl.id}')">${collageHtml}<button type="button" class="custom-list-del-btn" onclick="event.stopPropagation();app.confirmDeleteCustomList('${cl.id}')" title="Delete List">&times;</button><div class="custom-list-card-title">${cl.name}</div></div>`;
		}).join('');
		grid.innerHTML = watchedCard + customCards;
		if (watchedItems.length > 0 && grid.children[0]) {
			this.applyCardPosterBg(grid.children[0], watchedItems[0].poster_path);
		}
		customItemsList.forEach((items, idx) => {
			if (items.length > 0 && grid.children[idx + 1]) {
				this.applyCardPosterBg(grid.children[idx + 1], items[0].poster_path);
			}
		});
	},
	validateListName: function(name, excludeId = null) {
		if (!name) return false;
		const lower = name.toLowerCase();
		if (lower === 'bookmark' || lower === 'my list') {
			this.showToast('Name is reserved. Please pick another name.');
			return false;
		}
		if ((this.customLists || []).some(l => (!excludeId || String(l.id) !== String(excludeId)) && l.name.toLowerCase() === lower)) {
			this.showToast('A list with this name already exists.');
			return false;
		}
		return true;
	},
	toggleListInput: function(isRename, show) {
		const trigger = this.$g(isRename ? 'mylist-title-wrap' : 'btn-show-new-list');
		const wrap = this.$g(isRename ? 'rename-list-input-wrap' : 'new-list-input-wrap');
		const input = this.$g(isRename ? 'rename-list-name-input' : 'new-list-name-input');
		if (trigger) trigger.style.display = show ? 'none' : 'inline-flex';
		if (wrap) wrap.style.display = show ? 'inline-flex' : 'none';
		if (show && input) {
			if (isRename) {
				const target = (this.customLists || []).find(l => String(l.id) === String(this.activeCustomListId));
				input.value = target ? target.name : '';
				setTimeout(() => {
					input.focus();
					input.select();
				}, 60);
			} else {
				input.value = '';
				setTimeout(() => input.focus(), 60);
			}
		} else if (input) {
			input.value = '';
		}
	},
	toggleNewListInput: function(show) {
		this.toggleListInput(false, show);
	},
	toggleRenameListInput: function(show) {
		this.toggleListInput(true, show);
	},
	submitNewList: function() {
		const input = this.$g('new-list-name-input');
		if (!input) return;
		const name = input.value.trim();
		if (!this.validateListName(name)) return;
		if (!this.customLists) this.customLists = [];
		const newList = {
			id: 'cl_' + Date.now(),
			name: name.slice(0, 40),
			items: {}
		};
		this.customLists.push(newList);
		this.$storeSet('sh_custom_lists', this.customLists);
		this.toggleNewListInput(false);
		this.renderCustomListHub();
		this.showToast(`List "${newList.name}" created.`);
	},
	submitRenameList: function() {
		const input = this.$g('rename-list-name-input');
		if (!input || !this.activeCustomListId) return;
		const name = input.value.trim();
		const targetList = (this.customLists || []).find(l => String(l.id) === String(this.activeCustomListId));
		if (!targetList) return;
		if (!name || name === targetList.name) {
			this.toggleRenameListInput(false);
			return;
		}
		if (!this.validateListName(name, this.activeCustomListId)) return;
		targetList.name = name.slice(0, 40);
		this.$storeSet('sh_custom_lists', this.customLists);
		const titleEl = this.$g('mylist-view-title');
		if (titleEl) titleEl.innerText = targetList.name;
		const emptyEl = this.$g('mylist-grid')?.querySelector('.msg-box');
		if (emptyEl) emptyEl.innerHTML = this.getCustomListEmptyHtml(targetList.name);
		document.title = `${targetList.name} - My List`;
		this.toggleRenameListInput(false);
		this.showToast(`List renamed to "${targetList.name}".`);
	},
	confirmDeleteCustomList: function(listId) {
		this.showCustomPrompt('delete_custom_list', listId);
	},
	saveCustomLists(toastMsg) {
		this.$storeSet('sh_custom_lists', this.customLists);
		this.renderMyListHub();
		this.syncAllCardStars();
		if (toastMsg) this.showToast(toastMsg);
	},
	deleteCustomList: function(listId) {
		const idx = (this.customLists || []).findIndex(l => String(l.id) === String(listId));
		if (idx !== -1) {
			const listName = this.customLists[idx].name;
			this.customLists.splice(idx, 1);
			this.renderCustomListHub();
			this.saveCustomLists(`List "${listName}" deleted.`);
		}
	},
	confirmClearActiveList: function() {
		if (this.myListSub === 'bookmark') {
			this.showCustomPrompt('clear_bookmark');
		} else if (this.myListSub === 'custom_detail' && this.activeCustomListId) {
			this.showCustomPrompt('clear_custom_list', this.activeCustomListId);
		}
	},
	clearActiveCustomList: function(listId) {
		const target = (this.customLists || []).find(l => String(l.id) === String(listId));
		if (target) {
			target.items = {};
			this.openMyListSub('custom_detail', listId, false);
			this.saveCustomLists(`List "${target.name}" cleared.`);
		}
	},
	toggleBookmark: function(item) {
		this.mutateSavedItem('toggle', 'bookmark', item);
	},
	removeFromBookmark: function(idStr) {
		const eqIds = this.getEquivalentIds(idStr);
		let found = null;
		for (const eid of eqIds) {
			if (this.myList && this.myList[eid]) {
				found = this.myList[eid];
				break;
			}
		}
		this.mutateSavedItem('remove', 'bookmark', {
			id: idStr,
			...(found || {})
		});
	},
	removeFromCustomList: function(listId, idStr) {
		const targetList = (this.customLists || []).find(l => String(l.id) === String(listId));
		const eqIds = this.getEquivalentIds(idStr);
		let found = null;
		if (targetList && targetList.items) {
			for (const eid of eqIds) {
				if (targetList.items[eid]) {
					found = targetList.items[eid];
					break;
				}
			}
		}
		const item = found || {
			id: idStr
		};
		this.mutateSavedItem('remove', listId, item);
	},
	handleBookmarkBtnClick: function(safeStrOrItem, btnEl) {
		const item = typeof safeStrOrItem === 'string' ? this.decodeItem(safeStrOrItem) : safeStrOrItem;
		if (!item || !item.id) return;
		const idStr = String(item.id);
		if (this.activePopoverShowId) {
			const wasActive = (this.activePopoverShowId === idStr);
			this.closeAddToListPopover();
			if (wasActive) return;
		}
		if (!this.customLists || this.customLists.length === 0) {
			this.toggleBookmark(item, btnEl);
			return;
		}
		this.openAddToListPopover(item, btnEl);
	},
	openAddToListPopover: function(item, btnEl) {
		const pop = this.$g('add-to-list-popover');
		if (!pop || !btnEl) return;
		document.querySelectorAll('.poster-card.popover-active').forEach(c => c.classList.remove('popover-active'));
		const card = btnEl.closest ? btnEl.closest('.poster-card') : null;
		if (card) card.classList.add('popover-active');
		const parentRow = btnEl.closest ? btnEl.closest('.scroll-row') : null;
		if (parentRow) parentRow.dataset.userInteracting = '1';
		this.activePopoverShowId = String(item.id);
		this.activePopoverOpenTime = Date.now();
		this.renderAddToListPopover(item, btnEl);
		pop.style.display = 'block';
		const r = btnEl.getBoundingClientRect();
		const popW = pop.offsetWidth || 195;
		const popH = pop.offsetHeight || 150;
		let left = r.right - popW;
		if (left < 10) left = 10;
		if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
		let top = r.bottom + 6;
		if (top + popH > window.innerHeight - 10 && r.top - popH - 6 > 0) {
			top = r.top - popH - 6;
		}
		pop.style.left = `${Math.round(left)}px`;
		pop.style.top = `${Math.round(top)}px`;
	},
	closeAddToListPopover: function() {
		document.querySelectorAll('.poster-card.popover-active').forEach(c => c.classList.remove('popover-active'));
		const lastShowId = this.activePopoverShowId;
		this.activePopoverShowId = null;
		this.activePopoverOpenTime = 0;
		const pop = this.$g('add-to-list-popover');
		if (pop) pop.style.display = 'none';
		if (lastShowId && this.currentView === 'mylist') {
			if (this.myListSub === 'bookmark' && !this.getSavedStatus(lastShowId).inBookmark) {
				this.openMyListSub('bookmark', null, false);
			} else if (this.myListSub === 'custom_detail' && this.activeCustomListId) {
				const targetList = (this.customLists || []).find(l => String(l.id) === String(this.activeCustomListId));
				const inThisCustom = targetList && targetList.items && Array.from(this.getEquivalentIds(lastShowId)).some(eid => targetList.items[eid]);
				if (targetList && !inThisCustom) {
					this.openMyListSub('custom_detail', this.activeCustomListId, false);
				}
			}
		}
	},
	renderAddToListPopover: function(item, btnEl) {
		const pop = this.$g('add-to-list-popover');
		if (!pop) return;
		const idStr = String(item.id);
		const eqIds = this.getEquivalentIds(idStr, item);
		const encodedItem = this.encodeItem(this.toCardSummary(item));
		const checkSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
		const starSvg = '<span style="color:#378EF0;display:inline-flex;">' + STAR_SVG(15, 15) + '</span>';
		const {
			inBookmark
		} = this.getSavedStatus(idStr, item);
		const bookmarkIcon = inBookmark ? starSvg : '';
		let rowsHtml = '<div class="popover-row" onclick="event.stopPropagation();app.togglePopoverListItem(\'bookmark\', \'' + encodedItem + '\', this)">' +
			'<span class="popover-row-name">Bookmark</span>' +
			'<span class="popover-row-check">' + bookmarkIcon + '</span>' +
			'</div>';
		(this.customLists || []).forEach(cl => {
			const inCustom = Boolean(cl.items && Array.from(eqIds).some(eid => cl.items[eid]));
			const customIcon = inCustom ? checkSvg : '';
			const safeClName = cl.name || '';
			rowsHtml += '<div class="popover-row" onclick="event.stopPropagation();app.togglePopoverListItem(\'' + cl.id + '\', \'' + encodedItem + '\', this)">' +
				'<span class="popover-row-name">' + safeClName + '</span>' +
				'<span class="popover-row-check">' + customIcon + '</span>' +
				'</div>';
		});
		pop.innerHTML = '<div class="popover-header" onclick="app.closeAddToListPopover()" title="Close">Add to List</div><div class="popover-list">' + rowsHtml + '</div>';
	},
	togglePopoverListItem: function(listTarget, encodedItem, rowEl) {
		const item = typeof encodedItem === 'string' ? this.decodeItem(encodedItem) : encodedItem;
		if (!item || !item.id) return;
		const added = this.mutateSavedItem('toggle', listTarget, item);
		const chkSpan = rowEl ? rowEl.querySelector('.popover-row-check') : null;
		const isBookmark = (listTarget === 'bookmark');
		const iconSvg = isBookmark ? ('<span style="color:#378EF0;display:inline-flex;">' + STAR_SVG(15, 15) + '</span>') : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
		if (chkSpan) chkSpan.innerHTML = added ? iconSvg : '';
	},
	loadMarkedAsWatch: function() {
		const raw = this.sortByAddedAt(Object.values(this.watchedList || {}));
		const seen = new Set();
		const dedup = raw.filter(it => {
			if (!it) return false;
			const cKey = it.ani_id ? ('ani_' + it.ani_id) : (String(it.id).startsWith('ani_') ? String(it.id) : (this.animeCache?.[it.id]?.aniId ? ('ani_' + this.animeCache[it.id].aniId) : String(it.id)));
			if (seen.has(cKey)) return false;
			seen.add(cKey);
			return true;
		});
		const emptyWatchedHtml = '<div class="msg-box-sub">No titles marked as <span class="msg-box-btn-mock" style="color:#4ade80;">' + EYE_SVG(12, 12, false) + '</span></div>';
		this.renderGridList('markedaswatched-grid', 'clear-markedaswatched-btn', dedup, emptyWatchedHtml, 'watched');
	},
	getRecentSearches: function() {
		return this.$storeGet('sh_recent_searches', []);
	},
	saveRecentSearch: function(q) {
		if (!q) {
			const inp = this.$g('search-input');
			if (inp) q = inp.value;
		}
		if (!q) return;
		q = q.trim();
		if (q.length < 2) return;
		let list = this.getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase());
		list.unshift(q);
		if (list.length > 5) list = list.slice(0, 5);
		this.$storeSet('sh_recent_searches', list);
		this.renderRecentSearches();
	},
	removeRecentSearch: function(idx) {
		let list = this.getRecentSearches();
		list.splice(idx, 1);
		this.$storeSet('sh_recent_searches', list);
		this.renderRecentSearches();
	},
	applyRecentSearch: function(text) {
		const inp = this.$g('search-input');
		inp.value = text;
		this.toggleClearBtn('search-input', 'main-clear-btn');
		this.updateSearchFilterBar();
		this.saveRecentSearch(text);
		this.executeSearch(text);
	},
	renderRecentSearches: function() {
		const container = this.$g('search-recents');
		if (!container) return;
		const list = this.getRecentSearches();
		const hasCards = Boolean(document.querySelector('#search-grid .poster-card') || (this.lastSearchFullResults && this.lastSearchFullResults.length > 0));
		if (list.length === 0 || hasCards) {
			container.innerHTML = '';
			container.style.display = 'none';
			return;
		}
		container.style.display = 'flex';
		container.innerHTML = list.map((item, idx) => `
<div class="search-recent-item">
<button class="recent-del-btn" onclick="event.stopPropagation();app.removeRecentSearch(${idx})">&times;</button>
<span class="recent-text" onclick="app.applyRecentSearch('${item.replace(/'/g, "\\'")}')">${item}</span>
</div>
`).join('');
	},
	resetSearchInput: function(keepSimilar = false) {
		const inp = this.$g('search-input');
		if (inp) inp.value = '';
		this.toggleClearBtn('search-input', 'main-clear-btn');
		this.updateSearchFilterBar();
		this.searchFilter = 'all';
		document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
		const sfbAll = this.$g('sfb-all');
		if (sfbAll) sfbAll.classList.add('active');
		const g = this.$g('search-grid');
		if (g && !keepSimilar) g.innerHTML = '';
		const s = this.$g('search-suggestion');
		if (s) {
			s.style.display = 'none';
			s.innerHTML = '';
		}
		if (!keepSimilar) {
			this.lastSearchQuery = null;
			this.lastSearchFullResults = null;
			this.similarSearch = null;
			this.similarScrollPos = 0;
			const wrapEl = this.$g('similar-search-badge-wrap');
			if (wrapEl) wrapEl.style.display = 'none';
		}
		this.resetSearchYearSort();
	},
	luckyShuffleTimer: null,
	setLuckyPoster: function(item) {
		const pImg = this.$g('lucky-poster');
		const tEl = this.$g('lucky-title');
		if (pImg) {
			pImg.style.visibility = 'visible';
			pImg.style.opacity = '1';
			pImg.classList.add('loaded');
			pImg.src = this.getImg(item.poster_path, 'poster');
		}
		if (tEl) tEl.innerText = item.title || item.name;
	},
	resetLuckyUI: function(isRolling = false) {
		const wrap = this.$g('lucky-poster-wrap');
		const box = document.querySelector('.lucky-box');
		const rollBtn = this.$g('lucky-roll-btn');
		const watchBtn = this.$g('lucky-watch-btn');
		if (wrap) wrap.classList.remove('winner');
		if (box) {
			box.classList.remove('winner');
			box.classList.toggle('rolling', isRolling);
		}
		if (rollBtn) rollBtn.style.display = 'none';
		if (watchBtn) watchBtn.style.display = 'none';
	},
	async startFeelingLucky() {
		this.startLoader();
		const fState = this.getExploreFilterState();
		const {
			hasAnime,
			normalGenreIds,
			genre2Ids,
			years,
			countries,
			seasonIds,
			aniStudioIds,
			aniStaffIds
		} = fState;
		const type = this.$g('filter-type')?.value || 'all';
		const isYearSortActive = Boolean(this.yearSortOrder);
		const seen = new Set();
		let items = [];
		if (hasAnime) {
			const isMovie = this.exploreType === 'movie';
			let allowedLuckyIds = await this.resolveAniStudioStaffIds(aniStudioIds, aniStaffIds);
			if (allowedLuckyIds !== null && allowedLuckyIds.length === 0) {
				this.stopLoader();
				return;
			}
			const hasSpecificFilters = seasonIds.length > 0 || genre2Ids.length > 0 || years.length > 0 || countries.length > 0 || allowedLuckyIds !== null;
			const page1 = hasSpecificFilters ? 1 : (Math.floor(Math.random() * 3) + 1);
			const {
				gqlVars
			} = this.buildAniExploreVars(fState, type, isYearSortActive, this.yearSortOrder, page1, 35);
			if (type === 'all' && !isYearSortActive) {
				const rSorts = [
					['POPULARITY_DESC'],
					['TRENDING_DESC', 'POPULARITY_DESC'],
					['START_DATE_DESC']
				];
				gqlVars.sort = rSorts[Math.floor(Math.random() * rSorts.length)];
			}
			if (allowedLuckyIds !== null) gqlVars.id_in = allowedLuckyIds;
			const gqlQuery = this.buildAniCatalogGql('id idMal format episodes season seasonYear title { romaji english userPreferred } coverImage { extraLarge large medium } startDate { year month day } countryOfOrigin genres studios(isMain: true) { nodes { name isAnimationStudio } } trailer { id site }');
			try {
				let aniRes = await this.aniApi(gqlQuery, gqlVars);
				let mList = aniRes?.data?.Page?.media || [];
				if (mList.length === 0 && gqlVars.page !== 1) {
					gqlVars.page = 1;
					aniRes = await this.aniApi(gqlQuery, gqlVars);
					mList = aniRes?.data?.Page?.media || [];
				}
				if (seasonIds.length > 0) {
					mList = mList.filter(m => {
						const s = this.resolveAnimeSeason(m);
						return s && seasonIds.includes(s);
					});
				}
				mList.forEach(m => {
					const img = this.getAniCover(m.coverImage) || m.coverImage?.extraLarge || m.coverImage?.large;
					if (img && !seen.has('ani_' + m.id)) {
						seen.add('ani_' + m.id);
						const candidate = this.toAniCard(m, isMovie);
						if (candidate && !this.isBlocked(candidate, candidate.media_type)) {
							items.push(candidate);
						}
					}
				});
				if (countries.length > 1) {
					items = items.filter(i => countries.includes(i.country));
				}
			} catch (e) {}
		} else {
			const baseParams = this.buildTmdbDiscoverParams(fState);
			const probe = await this.api(`/discover/${this.exploreType}`, {
				...baseParams,
				page: 1,
				sort_by: 'popularity.desc'
			}).catch(() => null);
			const maxP = Math.min(probe?.total_pages || 1, 35);
			const getRandomPage = () => Math.floor(Math.random() * maxP) + 1;
			const queries = [
				this.api(`/discover/${this.exploreType}`, {
					...baseParams,
					page: getRandomPage(),
					sort_by: 'popularity.desc'
				}),
				this.api(`/discover/${this.exploreType}`, {
					...baseParams,
					page: getRandomPage(),
					sort_by: 'vote_count.desc'
				}),
				this.api(`/discover/${this.exploreType}`, {
					...baseParams,
					page: getRandomPage(),
					sort_by: 'vote_average.desc',
					'vote_count.gte': 40
				})
			];
			if (maxP > 1) {
				queries.push(this.api(`/discover/${this.exploreType}`, {
					...baseParams,
					page: getRandomPage(),
					sort_by: 'popularity.desc'
				}));
			}
			if (countries.length === 0) {
				const intlHubs = ['KR', 'JP', 'GB', 'FR', 'ES', 'IN', 'DE', 'IT', 'ID', 'TH', 'CA', 'AU', 'MX', 'SE'];
				const randHub = intlHubs[Math.floor(Math.random() * intlHubs.length)];
				queries.push(this.api(`/discover/${this.exploreType}`, {
					...baseParams,
					with_origin_country: randHub,
					page: Math.floor(Math.random() * 5) + 1,
					sort_by: 'popularity.desc'
				}));
			}
			const responses = await Promise.all(queries);
			responses.forEach(res => {
				(res.results || []).forEach(i => {
					if (i && i.poster_path && !seen.has(String(i.id)) && !this.isBlocked(i, this.exploreType)) {
						seen.add(String(i.id));
						items.push(i);
					}
				});
			});
			if (normalGenreIds.length > 0 || genre2Ids.length > 0) items = items.filter(i => !this.isAnimeItem(i));
			if (years.length > 1) items = items.filter(i => years.includes(this.getItemYear(i)));
		}
		if (items.length === 0) return;
		items.sort(() => Math.random() - 0.5);
		const modal = this.$g('lucky-modal');
		const wrap = this.$g('lucky-poster-wrap');
		const pImg = this.$g('lucky-poster');
		const tEl = this.$g('lucky-title');
		const rollBtn = this.$g('lucky-roll-btn');
		const watchBtn = this.$g('lucky-watch-btn');
		const box = document.querySelector('.lucky-box');
		this.resetLuckyUI(true);
		if (tEl) tEl.innerText = 'Rolling the reels...';
		const tooltip = this.$g('lucky-tooltip');
		if (tooltip) {
			const dismissed = this.$storeGet('sh_lucky_tooltip_dismissed', false) === true;
			tooltip.style.display = dismissed ? 'none' : 'flex';
		}
		modal.classList.add('active');
		document.body.classList.add('modal-open');
		if (!window.history.state || window.history.state.modal !== 'lucky') {
			window.history.pushState({
				modal: 'lucky',
				view: this.currentView
			}, '', window.location.href);
		}
		let count = 0;
		const totalSteps = 28;
		let delay = 60;
		const winner = items[Math.floor(Math.random() * items.length)];
		this.luckyWinner = winner;
		const spinReel = () => {
			const rand = items[Math.floor(Math.random() * items.length)];
			this.setLuckyPoster(rand);
			count++;
			if (count < totalSteps) {
				if (count >= 15) {
					delay += Math.floor((count - 13) * 9);
				}
				this.luckyShuffleTimer = setTimeout(spinReel, delay);
			} else {
				this.setLuckyPoster(winner);
				if (box) {
					box.classList.remove('rolling');
					box.classList.add('winner');
				}
				wrap.classList.add('winner');
				if (rollBtn) rollBtn.style.display = 'inline-flex';
				if (watchBtn) watchBtn.style.display = 'inline-flex';
			}
		};
		spinReel();
	},
	openLuckyShow: function() {
		if (!this.luckyWinner) return;
		const winner = this.luckyWinner;
		this.cancelLucky();
		this.openShowinfo(winner.id, winner.media_type || this.exploreType);
	},
	dismissLuckyTooltip: function() {
		this.$storeSet('sh_lucky_tooltip_dismissed', true);
		const tooltip = this.$g('lucky-tooltip');
		if (tooltip) tooltip.style.display = 'none';
	},
	cancelLucky: function(fromPopState = false, e = null) {
		if (e && e.target && e.target.id !== 'lucky-modal') return;
		clearTimeout(this.luckyShuffleTimer);
		if (!fromPopState && window.history.state && window.history.state.modal === 'lucky') {
			window.history.back();
			return;
		}
		const modal = this.$g('lucky-modal');
		if (modal) modal.classList.remove('active');
		this.syncModalOpen();
		this.resetLuckyUI(false);
		this.luckyWinner = null;
	},
	searchFilter: 'all',
	setSearchFilter: function(type) {
		this.searchFilter = type;
		document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
		const activeBtn = this.$g(`sfb-${type}`);
		if (activeBtn) activeBtn.classList.add('active');
		const query = this.$g('search-input')?.value.trim();
		if (this.lastSearchQuery === query && this.lastSearchFullResults) {
			this.renderCurrentSearchResults(query);
			return;
		}
		if (query && query.length >= 2) this.executeSearch(query);
	},
	triggerSearch: function() {
		clearTimeout(this.searchDebounceTimer);
		const query = this.$g('search-input').value.trim();
		this.updateSearchFilterBar();
		if (query.length < 2) {
			this.searchReqId = (this.searchReqId || 0) + 1;
			this.lastSearchQuery = null;
			this.lastSearchFullResults = null;
			const grid = this.$g('search-grid');
			if (grid) grid.innerHTML = '';
			this.renderRecentSearches();
			return;
		}
		this.saveRecentSearch(query);
		this.executeSearch(query);
	},
	async executeSearch(query) {
		clearTimeout(this.searchDebounceTimer);
		const currentReqId = ++this.searchReqId || (this.searchReqId = 1);
		if (this.similarSearch) {
			this.similarSearch = null;
			const wrapEl = this.$g('similar-search-badge-wrap');
			if (wrapEl) wrapEl.style.display = 'none';
		}
		const recentsEl = this.$g('search-recents');
		if (recentsEl) {
			recentsEl.innerHTML = '';
			recentsEl.style.display = 'none';
		}
		const grid = this.$g('search-grid');
		if (grid) grid.innerHTML = '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
		const box = this.$g('search-suggestion');
		box.style.display = 'none';
		box.innerHTML = '';
		const qTrim = (query || '').trim();
		const isImdbQuery = /^tt\d+$/i.test(qTrim);
		let results = [];
		if (isImdbQuery) {
			const findRes = await this.api(`/find/${qTrim}`, {
				external_source: 'imdb_id'
			});
			const mList = (findRes.movie_results || []).map(i => ({
				...i,
				media_type: 'movie'
			}));
			const tList = (findRes.tv_results || []).map(i => ({
				...i,
				media_type: 'tv'
			}));
			results = [...mList, ...tList].filter(i => i.poster_path);
		}
		if (results.length === 0 && !isImdbQuery) {
			let dataList = [];
			let personData = null;
			const [multiData, mData, tData] = await Promise.all([
				this.api('/search/multi', {
					query: query
				}),
				this.api('/search/movie', {
					query: query
				}),
				this.api('/search/tv', {
					query: query
				})
			]);
			personData = multiData;
			const merged = [];
			const seenKey = new Set();
			[
				[multiData, null],
				[mData, 'movie'],
				[tData, 'tv']
			].forEach(([res, defType]) => {
				(res?.results || []).forEach(i => {
					const t = defType || i.media_type;
					if ((t === 'movie' || t === 'tv') && i.poster_path && !seenKey.has(`${t}_${i.id}`)) {
						seenKey.add(`${t}_${i.id}`);
						merged.push(defType ? {
							...i,
							media_type: t
						} : i);
					}
				});
			});
			dataList = merged;
			const rawMatches = dataList.filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path);
			rawMatches.forEach(r => {
				if (!r._norm) r._norm = this.normTitle(r.title || r.name);
				if (!r._year) r._year = this.getItemYear(r);
			});
			const filteredMatches = rawMatches.filter(i => {
				if (i.media_type === 'movie') {
					const isDupTv = rawMatches.some(r => r.media_type === 'tv' && r._norm === i._norm && r._year === i._year);
					if (isDupTv) return false;
				}
				return true;
			});
			results = filteredMatches.filter(i => !this.isBlocked(i, i.media_type));
			const person = ((personData && personData.results) || []).find(i => i.media_type === 'person');
			if (person) {
				const credits = await this.api(`/person/${person.id}/combined_credits`);
				if (credits) {
					const works = [...(credits.cast || []), ...(credits.crew || [])]
						.filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path)
						.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
					const seen = new Set(results.map(r => String(r.id)));
					for (const item of works) {
						if (!seen.has(String(item.id))) {
							seen.add(String(item.id));
							results.push(item);
						}
					}
				}
			}
		}
		if (!isImdbQuery) {
			try {
				const aniRes = await this.aniApi(`query ($s: String) { Page(page: 1, perPage: 15) { media(search: $s, type: ANIME, isAdult: false) { id idMal format status season seasonYear title { romaji english userPreferred } coverImage { extraLarge large } bannerImage startDate { year month day } averageScore description countryOfOrigin genres studios(isMain: true) { nodes { name isAnimationStudio } } trailer { id site } relations { edges { relationType node { id idMal format status episodes startDate { year month day } studios(isMain: true) { nodes { name isAnimationStudio } } title { romaji english userPreferred } } } } } } }`, {
					s: qTrim
				});
				const aniList = aniRes?.data?.Page?.media || [];
				if (aniList.length > 0) {
					const existingTitles = new Set();
					results.forEach(r => {
						const t = r._norm || this.normTitle(r.title || r.name);
						if (t) existingTitles.add(t);
						if (r.original_title) existingTitles.add(this.normTitle(r.original_title));
						if (r.original_name) existingTitles.add(this.normTitle(r.original_name));
					});
					aniList.forEach(m => {
						if (m.isAdult || (m.genres && m.genres.includes('Hentai'))) return;
						if (this.isUnreleasedAniMedia(m)) return;
						const tEng = this.normTitle(m.title?.english);
						const tRom = this.normTitle(m.title?.romaji);
						const tUser = this.normTitle(m.title?.userPreferred);
						const rawTitles = [m.title?.english, m.title?.romaji, m.title?.userPreferred].filter(Boolean);
						const matchedTmdb = results.find(r => {
							const rT = this.normTitle(r.title || r.name);
							const rOt = this.normTitle(r.original_title);
							const rOn = this.normTitle(r.original_name);
							return (tEng && (rT === tEng || rOt === tEng || rOn === tEng)) || (tRom && (rT === tRom || rOt === tRom || rOn === tRom)) || (tUser && (rT === tUser || rOt === tUser || rOn === tUser));
						});
						if (matchedTmdb) {
							if (!matchedTmdb.genres || matchedTmdb.genres.length === 0) matchedTmdb.genres = m.genres || [];
							return;
						}
						if ((tEng && existingTitles.has(tEng)) || (tRom && existingTitles.has(tRom)) || (tUser && existingTitles.has(tUser))) {
							return;
						}
						if (['TV', 'TV_SHORT'].includes(m.format)) {
							if (m.relations?.edges?.some(e => (e.relationType === 'PREQUEL' && ['TV', 'TV_SHORT', 'ONA', 'SPECIAL', 'OVA', 'MOVIE'].includes(e.node?.format)) || (e.relationType === 'PARENT' && ['TV', 'TV_SHORT', 'ONA'].includes(e.node?.format)))) return;
							if ([tEng, tRom, tUser].filter(Boolean).some(tn => Array.from(existingTitles).some(et => et.length >= 4 && tn.startsWith(et)))) return;
							const isSeasonContinuation = rawTitles.some(rt => {
								if (!this.isAnimeSeasonSequel(rt)) return false;
								const base = this.normTitle(this.getAnimeBaseTitle(rt));
								return base && existingTitles.has(base);
							});
							if (isSeasonContinuation) return;
							if (m.relations?.edges) {
								const hasExistingPrequel = m.relations.edges.some(e => {
									if (e.relationType !== 'PREQUEL' || !e.node) return false;
									const pEng = this.normTitle(e.node.title?.english);
									const pRom = this.normTitle(e.node.title?.romaji);
									const pUser = this.normTitle(e.node.title?.userPreferred);
									return (pEng && existingTitles.has(pEng)) || (pRom && existingTitles.has(pRom)) || (pUser && existingTitles.has(pUser));
								});
								if (hasExistingPrequel) return;
							}
						}
						const aItem = this.toAniCard(m, m.format === 'MOVIE');
						if (aItem) results.push(aItem);
					});
					results = results.filter(i => !this.isBlocked(i, i.media_type));
				}
			} catch (e) {}
		}
		if (results.length === 0) {
			results = await this.fetchExternalFallbacks(qTrim, isImdbQuery, false);
		}
		this.lastSearchQuery = query;
		this.lastSearchFullResults = [...results];
		if (currentReqId !== this.searchReqId) return;
		const hasCards = this.renderCurrentSearchResults(query);
		this.checkSearchSuggestion(query);
	},
	renderCurrentSearchResults: function(query) {
		if (!this.lastSearchFullResults) return false;
		let results = [...this.lastSearchFullResults];
		if (this.searchFilter !== 'all') {
			results = results.filter(i => i.media_type === this.searchFilter);
		}
		const syWrap = this.$g('search-year-sort-wrap');
		if (syWrap) syWrap.style.display = results.length > 1 ? 'inline-flex' : 'none';
		if (this.searchYearSortOrder) this.sortMediaByYear(results, this.searchYearSortOrder);
		const grid = this.$g('search-grid');
		const renderedHtml = results.map(i => this.buildCard(i)).join('');
		const hasCards = Boolean(renderedHtml.trim());
		if (!hasCards) {
			grid.innerHTML = (query && query.trim().length >= 2) ? '<div class="msg-box">No results found.</div>' : '';
		} else {
			grid.innerHTML = renderedHtml;
			const recentsEl = this.$g('search-recents');
			if (recentsEl) recentsEl.style.display = 'none';
		}
		return hasCards;
	},
	checkSearchSuggestion: async function(query) {
		const box = this.$g('search-suggestion');
		if (!box) return;
		const qTrim = (query || '').trim();
		if (!qTrim || qTrim.length < 2) {
			box.style.display = 'none';
			box.innerHTML = '';
			return;
		}
		const cleanStr = (s) => this.normTitle(s);
		const cleanWords = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
		const qClean = cleanStr(qTrim);
		if (!qClean) {
			box.style.display = 'none';
			box.innerHTML = '';
			return;
		}
		const qWords = cleanWords(qTrim);
		const visibleCardEls = Array.from(document.querySelectorAll('#search-grid .poster-card'));
		const visibleCardCount = visibleCardEls.length;
		if (visibleCardCount > 0) {
			const visibleIds = new Set(visibleCardEls.map(el => String(el.dataset.showId || '')));
			const visibleTitles = [];
			visibleCardEls.forEach(el => {
				const tEl = el.querySelector('.card-title');
				if (tEl && tEl.textContent) visibleTitles.push(tEl.textContent);
			});
			(this.lastSearchFullResults || []).forEach(item => {
				if (item && item.id && visibleIds.has(String(item.id))) {
					if (item.title) visibleTitles.push(item.title);
					if (item.name) visibleTitles.push(item.name);
					if (item.original_title) visibleTitles.push(item.original_title);
					if (item.original_name) visibleTitles.push(item.original_name);
					if (item.romaji) visibleTitles.push(item.romaji);
				}
			});
			const cleanTitles = visibleTitles.map(cleanStr).filter(Boolean);
			const allTitleWords = new Set();
			visibleTitles.forEach(t => cleanWords(t).forEach(w => allTitleWords.add(w)));
			const hasExactTitle = cleanTitles.some(ct => ct === qClean);
			const hasSubstrTitle = qClean.length >= 4 && cleanTitles.some(ct => ct.includes(qClean) || (ct.length >= 4 && qClean.includes(ct)));
			const allWordsMatch = qWords.length > 0 && qWords.every(qw => allTitleWords.has(qw) || cleanTitles.some(ct => ct.includes(qw)));
			const isRealMatch = hasExactTitle || hasSubstrTitle || (allWordsMatch && (visibleCardCount > 1 || qWords.length > 1));
			if (isRealMatch) {
				box.style.display = 'none';
				box.innerHTML = '';
				return;
			}
		}
		try {
			const cleanSugg = (s) => (s || '').replace(/\s*\([^)]*\)/g, '').trim();
			let candidate = null;
			const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(qTrim)}&utf8=&format=json&origin=*`;
			const res = await fetch(wikiUrl);
			if (res.ok) {
				const data = await res.json();
				candidate = cleanSugg(data?.query?.searchinfo?.suggestion);
				if (!candidate && data?.query?.search && data.query.search.length > 0) {
					const topItem = data.query.search.find(s => cleanStr(cleanSugg(s.title)) !== qClean) || data.query.search[0];
					if (topItem && topItem.title) {
						const t = cleanSugg(topItem.title);
						if (cleanStr(t) !== qClean) candidate = t;
					}
				}
			}
			if (!candidate) {
				const openUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(qTrim)}&limit=3&namespace=0&format=json&origin=*`;
				const openRes = await fetch(openUrl);
				if (openRes.ok) {
					const openData = await openRes.json();
					if (Array.isArray(openData?.[1])) {
						const match = openData[1].map(cleanSugg).find(x => x && cleanStr(x) !== qClean);
						if (match) candidate = match;
					}
				}
			}
			if (!candidate && visibleCardCount === 0) {
				try {
					const dmRes = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(qTrim)}`).then(r => r.json());
					if (Array.isArray(dmRes)) {
						const dmMatch = dmRes.map(x => cleanSugg(x.word)).find(w => w && cleanStr(w) !== qClean);
						if (dmMatch) candidate = dmMatch;
					}
				} catch (e) {}
			}
			if (candidate) {
				candidate = cleanSugg(candidate);
				const candClean = cleanStr(candidate);
				if (candClean && candClean !== qClean) {
					box.innerHTML = 'Did you mean: <span id="sugg-val" style="color:#ffffff;font-weight:bold;text-decoration:underline;cursor:pointer;">' + candidate + '</span>?';
					box.style.display = 'block';
					const suggEl = this.$g('sugg-val');
					if (suggEl) {
						suggEl.onclick = () => app.applySuggestion(candidate);
					}
					return;
				}
			}
		} catch (e) {}
		box.style.display = 'none';
		box.innerHTML = '';
	},
	applySuggestion: function(text) {
		const inp = this.$g('search-input');
		inp.value = text;
		this.toggleClearBtn('search-input', 'main-clear-btn');
		this.updateSearchFilterBar();
		this.$g('search-suggestion').style.display = 'none';
		this.$g('search-suggestion').innerHTML = '';
		this.executeSearch(text);
	},
	syncHistoryUrl: function(state, title, url, pushState, replaceState) {
		if (title) document.title = title;
		if (pushState && !replaceState) window.history.pushState(state, title, url);
		else if (replaceState) window.history.replaceState(state, title, url);
	},
	restorePreviousSearchState: function(shouldRestoreScroll = true) {
		const inp = this.$g('search-input');
		if (inp) inp.style.display = '';
		const goBtn = document.querySelector('#view-search .btn-search-go');
		if (goBtn) goBtn.style.display = '';
		if (this.lastSearchQuery && this.lastSearchFullResults) {
			if (inp && this.lastSearchQuery) inp.value = this.lastSearchQuery;
			if (this.$g('main-clear-btn')) this.toggleClearBtn('search-input', 'main-clear-btn');
			this.updateSearchFilterBar();
			document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
			const sfbActive = this.$g(`sfb-${this.searchFilter || 'all'}`);
			if (sfbActive) sfbActive.classList.add('active');
			const syWrap = this.$g('search-year-sort-wrap');
			if (syWrap) syWrap.style.display = this.lastSearchFullResults.length > 1 ? 'inline-flex' : 'none';
			const recentsEl = this.$g('search-recents');
			if (recentsEl) recentsEl.style.display = 'none';
			const grid = this.$g('search-grid');
			if (grid && !grid.children.length) this.renderCurrentSearchResults(this.lastSearchQuery);
			if (shouldRestoreScroll && this.searchScrollPos > 0) this.restoreScroll(this.searchScrollPos);
		} else if (inp && inp.value.trim().length >= 2) {
			this.executeSearch(inp.value.trim());
		} else {
			if (inp) inp.value = '';
			if (this.$g('main-clear-btn')) this.toggleClearBtn('search-input', 'main-clear-btn');
			this.updateSearchFilterBar();
			this.resetSearchYearSort();
			const grid = this.$g('search-grid');
			if (grid) grid.innerHTML = '';
			this.renderRecentSearches();
		}
	},
	setupSearch: function() {
		const inp = this.$g('search-input');
		inp.addEventListener('input', (e) => {
			clearTimeout(this.searchDebounceTimer);
			const query = e.target.value.trim();
			this.toggleClearBtn('search-input', 'main-clear-btn');
			this.updateSearchFilterBar();
			if (query.length < 2) {
				this.searchReqId = (this.searchReqId || 0) + 1;
				this.stopLoader();
				this.lastSearchQuery = null;
				this.lastSearchFullResults = null;
				this.$g('search-grid').innerHTML = '';
				this.$g('search-suggestion').style.display = 'none';
				this.$g('search-suggestion').innerHTML = '';
				const syWrap = this.$g('search-year-sort-wrap');
				if (syWrap) syWrap.style.display = 'none';
				this.renderRecentSearches();
				return;
			}
			const recentsEl = this.$g('search-recents');
			if (recentsEl) {
				recentsEl.innerHTML = '';
				recentsEl.style.display = 'none';
			}
			const grid = this.$g('search-grid');
			if (grid) grid.innerHTML = '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
			this.searchDebounceTimer = setTimeout(() => this.executeSearch(query), 800);
		});
		inp.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				clearTimeout(this.searchDebounceTimer);
				this.saveRecentSearch();
				this.triggerSearch();
			}
		});
		inp.addEventListener('blur', () => {
			const q = inp.value.trim();
			if (q.length >= 2) this.saveRecentSearch(q);
		});
	},
	toggleCollapse: function(side) {
		const bar = this.$g('w-controls-bar');
		const lBtn = this.$g('w-col-left-btn');
		const rBtn = this.$g('w-col-right-btn');
		const uBtn = this.$g('w-col-up-btn');
		const dBtn = this.$g('w-col-down-btn');
		const epPanel = this.$g('w-ep-panel');
		const srvPanel = this.$g('w-server-panel');
		if (epPanel) epPanel.classList.remove('active');
		if (srvPanel) srvPanel.classList.remove('active');
		const cur = 'collapsed-' + side;
		if (bar.classList.contains(cur)) {
			bar.classList.remove(cur);
			this.resetCollapseBtns();
		} else {
			bar.classList.remove('collapsed-left', 'collapsed-right', 'collapsed-up', 'collapsed-down');
			this.resetCollapseBtns();
			bar.classList.add(cur);
			if (side === 'left') lBtn.innerHTML = TRI_ARROW_SVG('m19 12-12 9V3z');
			else if (side === 'right') rBtn.innerHTML = TRI_ARROW_SVG('m5 12 12-9v18z');
			else if (side === 'up') uBtn.innerHTML = TRI_ARROW_SVG('m12 19 9-12H3z');
			else if (side === 'down') dBtn.innerHTML = TRI_ARROW_SVG('m12 5 9 12H3z');
		}
	},
	toggleWatchMenu: function(target, e) {
		if (e && e.stopPropagation) e.stopPropagation();
		const epPanel = this.$g('w-ep-panel');
		const srvPanel = this.$g('w-server-panel');
		const container = this.$g('global-player-container');
		if (target === 'ep') {
			srvPanel.classList.remove('active');
			epPanel.classList.toggle('active');
		} else {
			epPanel.classList.remove('active');
			srvPanel.classList.toggle('active');
		}
		if (epPanel.classList.contains('active') || srvPanel.classList.contains('active')) {
			container.classList.add('ui-locked');
		} else {
			container.classList.remove('ui-locked');
		}
	},
	watchChangeType: function(val) {
		if (this.watchState && this.watchState.isAnime) {
			this.$storeSet('preferredAnimeVariant', val);
			const pKey = (val === 'dub') ? 'preferredAnimeDubPlayer' : 'preferredAnimePlayer';
			const savedP = this.$storeGet(pKey, '1') || '1';
			this.updatePlayerDropdown(val, savedP);
		} else {
			this.$storeSet('preferredType', val);
			this.updatePlayerDropdown(val, '1');
			this.$storeSet('preferredPlayer', '1');
		}
		this.updateIframeSrc();
	},
	async watchChangeSeason(val) {
		if (String(val).startsWith('hyb_')) {
			const hS = parseInt(String(val).replace('hyb_', ''), 10) || 1;
			const curWatchId = String(this.watchState?.id || '');
			const animeInfo = this.getShowAnimeInfo(curWatchId, 1);
			const validWatchSeasons = (this.currentShow?.seasons || []).filter(s => this.isSeasonAired(s));
			const hybridList = animeInfo?.hybridSeasonList || ((validWatchSeasons.length > 1 && animeInfo?.sequelChain) ? this.buildHybridSeasonList(validWatchSeasons, animeInfo.sequelChain, this.currentShow) : null);
			const targetH = hybridList ? hybridList.find(h => h.season_number === hS) : null;
			if (targetH) {
				this.showSeasons[this.watchState.id] = hS;
				this.$storeSet('showSeasons', this.showSeasons);
				const targetTmdbS = targetH._tmdbSeason !== undefined ? targetH._tmdbSeason : 1;
				let targetEp = targetH._epStart || 1;
				if (targetH._isSpecialGroup) {
					const s0Data = await this.fetchSeasonEpisodes(this.watchState.id, 0);
					const specEps = this.resolveSpecialGroupEps(s0Data?.episodes || [], targetH._specialEntries, targetH.season_number);
					if (specEps.length > 0) targetEp = specEps[0].episode_number;
				}
				this.openWatch(this.watchState.id, this.watchState.type, targetTmdbS, targetEp, true, false, hS);
				return;
			}
		}
		if (String(val).startsWith('virt_')) {
			const vS = parseInt(String(val).replace('virt_', ''), 10) || 1;
			const curWatchId = String(this.watchState?.id || '');
			const animeInfo = this.getShowAnimeInfo(curWatchId, 1);
			let rawEp = 1;
			if (animeInfo?.sequelChain) {
				let off = 0;
				for (const entry of animeInfo.sequelChain) {
					if ((entry.season || 1) === vS) {
						rawEp = off + 1;
						break;
					}
					off += (entry.episodes || 0);
				}
			}
			this.showSeasons[this.watchState.id] = vS;
			this.$storeSet('showSeasons', this.showSeasons);
			this.openWatch(this.watchState.id, this.watchState.type, this.watchState.season || 1, rawEp);
			return;
		}
		const sNum = parseInt(val, 10) || 1;
		const sData = await this.fetchSeasonEpisodes(this.watchState.id, sNum);
		const firstEp = (sData && sData.episodes && sData.episodes.length > 0) ? sData.episodes[0].episode_number : 1;
		this.openWatch(this.watchState.id, this.watchState.type, sNum, firstEp);
	},
	watchChangeEpisode: function(val) {
		this.openWatch(this.watchState.id, this.watchState.type, this.watchState.season, val, true, false, this.showSeasons[this.watchState.id]);
	},
	watchChangeServer: function(val) {
		if (this.watchState && this.watchState.isAnime) {
			const typeSel = this.$g('w-player-type-sel');
			const curVariant = (typeSel ? typeSel.value : null) || this.$storeGet('preferredAnimeVariant', 'sub') || 'sub';
			const pKey = (curVariant === 'dub') ? 'preferredAnimeDubPlayer' : 'preferredAnimePlayer';
			this.$storeSet(pKey, val);
		} else {
			this.$storeSet('preferredPlayer', val);
		}
		this.updateIframeSrc();
	},
	lastNonMinPos: {
		portrait: 'bottom-mid',
		landscape: 'top-right'
	},
	lastPort: null,
	minNavIdleTimer: null,
	resetMinNavTimer: function() {
		const nav = document.querySelector('.glass-nav');
		if (!nav) return;
		clearTimeout(this.minNavIdleTimer);
		if (!nav.classList.contains('is-minimized')) {
			nav.classList.remove('is-idle-hidden');
			return;
		}
		nav.classList.remove('is-idle-hidden');
		this.minNavIdleTimer = setTimeout(() => {
			if (nav.classList.contains('is-minimized') && !nav.classList.contains('is-dragging')) {
				nav.classList.add('is-idle-hidden');
			}
		}, 1800);
	},
	setNavPosition: function(posId, save = true, animType = false) {
		const nav = document.querySelector('.glass-nav');
		if (!nav) return;
		const isPort = window.matchMedia('(orientation: portrait)').matches;
		const isMin = posId === 'mid-left' || posId === 'mid-right';
		nav.classList.remove('pos-top-left', 'pos-top-mid', 'pos-top-right', 'pos-bottom-left', 'pos-bottom-mid', 'pos-bottom-right', 'pos-mid-left', 'pos-mid-right', 'is-minimized', 'nav-anim', 'nav-fade', 'nav-collapsing', 'is-idle-hidden');
		if (animType) void nav.offsetWidth;
		if (!isMin) {
			this.lastNonMinPos[isPort ? 'portrait' : 'landscape'] = posId;
		}
		nav.classList.add(`pos-${posId}`);
		const isTop = typeof posId === 'string' && posId.startsWith('top-');
		document.body.classList.toggle('nav-pos-top', isTop);
		if (isMin) {
			nav.classList.add('is-minimized');
			const btn = this.$g('nav-min-btn');
			if (btn) btn.innerHTML = posId === 'mid-left' ? '&#9654;' : '&#9664;';
			this.resetMinNavTimer();
		} else {
			clearTimeout(this.minNavIdleTimer);
		}
		if (animType === 'slide' || animType === true) {
			nav.classList.add('nav-anim');
		} else if (animType === 'fade') {
			nav.classList.add('nav-fade');
		}
		if (save) {
			this.$storeSet(isPort ? 'sh_nav_pos_portrait' : 'sh_nav_pos_landscape', posId);
		}
	},
	restoreNav: function() {
		const nav = document.querySelector('.glass-nav');
		if (!nav) return;
		clearTimeout(this.minNavIdleTimer);
		nav.classList.remove('is-idle-hidden');
		if (nav.classList.contains('pos-mid-left') || nav.classList.contains('pos-mid-right')) {
			nav.classList.remove('is-minimized', 'nav-collapsing', 'nav-anim');
			void nav.offsetWidth;
			nav.classList.add('nav-anim');
			setTimeout(() => nav.classList.remove('nav-anim'), 220);
			return;
		}
		const isPort = window.matchMedia('(orientation: portrait)').matches;
		const target = this.lastNonMinPos[isPort ? 'portrait' : 'landscape'] || (isPort ? 'top-mid' : 'top-right');
		this.setNavPosition(target, true, 'slide');
	},
	renderFilterBars: function() {
		const mBox = (k, fk, ph, fn, hide = false, pfx = 'filter-', sc = 'explore', ro = false) => `<div class="comp-net-wrap" id="${pfx}${fk}-wrap"${hide ? ' style="display:none;"' : ''}><div class="filter-multi-box" onclick="app.activateMultiInput('${k}','${sc}')"><div class="filter-tags-wrap" id="${pfx}${fk}-tags"></div><input type="text" class="filter-multi-input" id="${pfx}${fk}-input" placeholder="${ph}"${ro ? ' readonly' : ''} autocomplete="off"${ro ? '' : ` oninput="app.${fn}(this.value,'${sc}')"`}></div><div class="comp-net-dropdown" id="${pfx}${fk}-drop"></div></div>`;
		const build = (prefix, scope) => {
			const isExp = scope === 'explore';
			const isPerson = scope === 'person';
			const isSource = scope === 'source';
			const typePh = (isExp || isPerson || isSource) ? 'Sort By' : 'Type';
			const defTypeVal = isExp ? 'all' : '';
			const cnPh = isExp ? 'Studio' : 'Studio / Network';
			let filterControls = '';
			if (isExp) {
				filterControls = '<button type="button" class="btn-filter-toggle" id="btn-filter-toggle" onclick="app.toggleExploreFilterBar()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M6 8h12" /><path d="M8 12h8" /><path d="M10 16h4" /></svg><span>Filters</span></button><button type="button" class="btn-explore-search" id="btn-explore-search" style="display:none;" onclick="app.toggleExploreEntitySearch()">' + EXPLORE_SEARCH_SVG(18, 18) + '<span>Search</span></button><div class="explore-entity-search-wrap" id="explore-entity-search-wrap" style="display:none;"><button type="button" id="explore-entity-search-close" class="explore-entity-search-close" onclick="app.closeExploreEntitySearch()">&times;</button><input type="text" id="explore-entity-search-input" class="explore-entity-search-input" placeholder="Search..." autocomplete="off" oninput="app.onExploreEntitySearchInput(this.value)" onkeydown="if(event.key===\'Enter\')app.triggerExploreEntitySearch();else if(event.key===\'Escape\')app.closeExploreEntitySearch()"></div><button type="button" class="btn-anime" id="btn-explore-anime" onclick="app.toggleAnimeExplore()">' + ANIME_BTN_SVG(18, 18) + '<span>Anime</span></button><button type="button" class="btn-lucky" id="btn-explore-random" onclick="app.startFeelingLucky()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="2.25" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="2.25" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="2.25" fill="currentColor" stroke="none" /></svg><span>Random</span></button><div class="filter-minimized-info" id="filter-minimized-info"></div>';
			} else if (isPerson) {
				filterControls = '<button type="button" class="btn-filter-toggle" id="btn-person-filter-toggle" onclick="app.togglePersonFilterBar()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M6 8h12" /><path d="M8 12h8" /><path d="M10 16h4" /></svg><span>Filters</span></button><button type="button" class="btn-explore-search" id="btn-person-search" onclick="app.toggleCatalogSearch(\'person\')">' + EXPLORE_SEARCH_SVG(18, 18) + '<span>Search</span></button><div class="explore-entity-search-wrap" id="person-search-wrap" style="display:none;"><button type="button" id="person-search-close" class="explore-entity-search-close" onclick="app.closeCatalogSearch(\'person\')">&times;</button><input type="text" id="person-search-input" class="explore-entity-search-input" placeholder="Search titles..." autocomplete="off" oninput="app.onCatalogSearchInput(\'person\',this.value)" onkeydown="if(event.key===\'Enter\')app.triggerCatalogSearch(\'person\');else if(event.key===\'Escape\')app.closeCatalogSearch(\'person\')"></div><div class="filter-minimized-info" id="person-filter-minimized-info"></div>';
			} else if (isSource) {
				filterControls = '<button type="button" class="btn-filter-toggle" id="btn-source-filter-toggle" onclick="app.toggleSourceFilterBar()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M6 8h12" /><path d="M8 12h8" /><path d="M10 16h4" /></svg><span>Filters</span></button><button type="button" class="btn-explore-search" id="btn-source-search" onclick="app.toggleCatalogSearch(\'source\')">' + EXPLORE_SEARCH_SVG(18, 18) + '<span>Search</span></button><div class="explore-entity-search-wrap" id="source-search-wrap" style="display:none;"><button type="button" id="source-search-close" class="explore-entity-search-close" onclick="app.closeCatalogSearch(\'source\')">&times;</button><input type="text" id="source-search-input" class="explore-entity-search-input" placeholder="Search titles..." autocomplete="off" oninput="app.onCatalogSearchInput(\'source\',this.value)" onkeydown="if(event.key===\'Enter\')app.triggerCatalogSearch(\'source\');else if(event.key===\'Escape\')app.closeCatalogSearch(\'source\')"></div><div class="filter-minimized-info" id="source-filter-minimized-info"></div>';
			}
			let filterBoxes = '';
			if (isPerson) {
				filterBoxes = `<div class="comp-net-wrap" id="${prefix}type-wrap"><input type="text" class="filter-select filter-type-select" id="${prefix}type-input" placeholder="${typePh}" readonly autocomplete="off" onclick="app.toggleTypeDropdown('${scope}')"><button type="button" class="comp-net-clear-btn" id="${prefix}type-clear" onclick="event.stopPropagation();app.clearType('${scope}')">&times;</button><input type="hidden" id="${prefix}type" value="${defTypeVal}"><div class="comp-net-dropdown" id="${prefix}type-drop"></div></div>
${isExp ? mBox('exp-role', 'exp-role', 'Role', 'searchExpRole', true, prefix, scope, true) : ''}
${mBox('genre', 'genre', 'Genre', 'searchGenre', false, prefix, scope)}
${mBox('year', 'year', 'Year', 'searchYear', false, prefix, scope)}
${mBox('country', 'country', 'Country', 'searchCountry', false, prefix, scope)}
<button type="button" class="filter-clear-all-btn" id="${prefix}clear-all-btn" onclick="app.clearPersonFilters()">&times;</button>`;
			} else if (isSource) {
				filterBoxes = `<div class="comp-net-wrap" id="${prefix}type-wrap"><input type="text" class="filter-select filter-type-select" id="${prefix}type-input" placeholder="${typePh}" readonly autocomplete="off" onclick="app.toggleTypeDropdown('${scope}')"><button type="button" class="comp-net-clear-btn" id="${prefix}type-clear" onclick="event.stopPropagation();app.clearType('${scope}')">&times;</button><input type="hidden" id="${prefix}type" value="${defTypeVal}"><div class="comp-net-dropdown" id="${prefix}type-drop"></div></div>
${isExp ? mBox('exp-role', 'exp-role', 'Role', 'searchExpRole', true, prefix, scope, true) : ''}
${mBox('genre', 'genre', 'Genre', 'searchGenre', false, prefix, scope)}
${mBox('year', 'year', 'Year', 'searchYear', false, prefix, scope)}
${mBox('country', 'country', 'Country', 'searchCountry', false, prefix, scope)}
${mBox('person', 'person', 'Cast & Crew', 'searchPerson', false, prefix, scope)}
<button type="button" class="filter-clear-all-btn" id="${prefix}clear-all-btn" onclick="app.clearSourceFilters()">&times;</button>`;
			} else {
				filterBoxes = `<div class="comp-net-wrap" id="${prefix}type-wrap"><input type="text" class="filter-select filter-type-select" id="${prefix}type-input" placeholder="${typePh}" readonly autocomplete="off" onclick="app.toggleTypeDropdown('${scope}')"><button type="button" class="comp-net-clear-btn" id="${prefix}type-clear" onclick="event.stopPropagation();app.clearType('${scope}')">&times;</button><input type="hidden" id="${prefix}type" value="${defTypeVal}"><div class="comp-net-dropdown" id="${prefix}type-drop"></div></div>
${isExp ? mBox('exp-role', 'exp-role', 'Role', 'searchExpRole', true, prefix, scope, true) : ''}
${mBox('genre', 'genre', 'Genre', 'searchGenre', false, prefix, scope)}
${mBox('genre2', 'genre2', 'Genre', 'searchGenre2', true, prefix, scope)}
${isExp ? mBox('aniTag', 'ani-tag', 'Tags', 'searchAniTag', true, prefix, scope) : ''}
${isExp ? mBox('season', 'season', 'Season', 'searchSeason', true, prefix, scope) : ''}
${isExp ? ('<div class="filter-year-group" id="filter-year-group">' + mBox('year', 'year', 'Year', 'searchYear', false, prefix, scope) + '<div class="year-sort-wrap" id="year-sort-wrap" style="display:none;"><div class="year-sort-btn" id="year-sort-btn"><button type="button" class="year-sort-half year-sort-desc" id="year-sort-desc-btn" onclick="app.setYearSort(\'desc\')" title="Newest Year First"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l9 14H3z"/></svg></button><button type="button" class="year-sort-half year-sort-asc" id="year-sort-asc-btn" onclick="app.setYearSort(\'asc\')" title="Oldest Year First"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20L3 6h18z"/></svg></button></div></div></div>') : mBox('year', 'year', 'Year', 'searchYear', false, prefix, scope)}
${mBox('compNet', 'comp-net', cnPh, 'searchCompNet', false, prefix, scope)}
${mBox('country', 'country', 'Country', 'searchCountry', false, prefix, scope)}
${isExp ? ('<div class="filter-person-group" id="filter-person-group">' + mBox('person', 'person', 'Cast & Crew', 'searchPerson', false, prefix, scope) + '<div class="person-role-wrap" id="person-role-wrap" style="display:none;"><div class="person-role-btn-group" id="person-role-btn-group"><button type="button" class="person-role-btn" id="person-role-main-btn" onclick="app.setPersonRole(\'main\')">Main</button><button type="button" class="person-role-btn" id="person-role-other-btn" onclick="app.setPersonRole(\'other\')">Other</button></div></div></div>') : mBox('person', 'person', 'Cast & Crew', 'searchPerson', false, prefix, scope)}
${isExp ? mBox('aniStudio', 'ani-studio', 'Studios', 'searchAniStudio', true, prefix, scope) : ''}
${isExp ? ('<div class="filter-ani-staff-group" id="filter-ani-staff-group" style="display:none;">' + mBox('aniStaff', 'ani-staff', 'Staff', 'searchAniStaff', false, prefix, scope) + '<div class="person-role-wrap" id="ani-staff-role-wrap" style="display:none;"><div class="person-role-btn-group" id="ani-staff-role-btn-group"><button type="button" class="person-role-btn" id="ani-staff-role-main-btn" onclick="app.setAniStaffRole(\'main\')">Main</button><button type="button" class="person-role-btn" id="ani-staff-role-other-btn" onclick="app.setAniStaffRole(\'other\')">Other</button></div></div></div>') : ''}
${isExp ? '<button type="button" class="filter-clear-all-btn" id="filter-clear-all-btn" onclick="app.clearAllFilters()">&times;</button>' : ''}`;
			}
			const wrapId = isExp ? 'explore-filter-boxes-wrap' : `${prefix}boxes-wrap`;
			return (isExp || isPerson || isSource) ? `${filterControls}<div class="explore-filter-boxes-wrap" id="${wrapId}">${filterBoxes}</div>` : filterBoxes;
		};
		const ef = this.$g('explore-filter-bar'),
			bf = this.$g('block-filter-bar'),
			pf = this.$g('person-catalog-filter-bar'),
			sf = this.$g('source-catalog-filter-bar');
		if (ef) {
			ef.innerHTML = build('filter-', 'explore');
			this.updateExploreFilterToggleUI();
		}
		if (bf) bf.innerHTML = build('bc-', 'block');
		if (pf) {
			pf.innerHTML = build('pf-', 'person');
			this.updatePersonFilterToggleUI();
		}
		if (sf) {
			sf.innerHTML = build('sf-', 'source');
			this.updateSourceFilterToggleUI();
		}
	},
	renderOptionsSheet: function() {
		const sl = this.$g('sheet-list');
		if (!sl) return;
		const items = [
			['history', 'Watch History', '', '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 'currentColor'],
			['browsing', 'Browsing History', '', '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 'currentColor'],
			['blocklist', 'Blocklist', '', '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>', 'currentColor'],
			['customize', 'Customize', '', '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', 'currentColor'],
			['storage', 'Data & Storage', '', '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 10c0 1.66 4.03 3 9 3s9-1.34 9-3"/><path d="M3 15c0 1.66 4.03 3 9 3s9-1.34 9-3"/>', 'currentColor'],
			['about', 'Disclaimer', '', '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', 'currentColor']
		];
		sl.innerHTML = items.map(it => {
			if (!it) return '<div class="sheet-divider"></div>';
			const [opt, label, cls, svgPaths, stroke] = it;
			return `<div class="sheet-item" onclick="app.openOption('${opt}')"><div class="sheet-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg></div><div class="sheet-item-label${cls}">${label}</div></div>`;
		}).join('');
	},
	renderCustomizeModal: function() {
		const cb = this.$g('customize-body');
		if (!cb) return;
		const qRow = (pref, title, desc, id, opts = [{
			v: 'low',
			l: 'Low'
		}, {
			v: 'mid',
			l: 'Medium'
		}, {
			v: 'high',
			l: 'High'
		}]) => '<div class="pref-row"><div class="pref-info"><div class="pref-title">' + title + '</div><div class="pref-desc">' + desc + '</div></div><select id="' + id + '" class="w-select" style="width:auto;min-width:120px;padding:6px 10px;" onchange="app.updatePref(\'' + pref + '\', this.value)">' + opts.map(o => '<option value="' + o.v + '"' + (o.v === 'high' ? ' selected' : '') + '>' + o.l + '</option>').join('') + '</select></div>';
		const sRow = (pref, title, desc, id, chk = false) => '<div class="pref-row"><div class="pref-info"><div class="pref-title">' + title + '</div><div class="pref-desc">' + desc + '</div></div><label class="pref-switch"><input type="checkbox" id="' + id + '"' + (chk ? ' checked' : '') + ' onchange="app.updatePref(\'' + pref + '\', this.checked)"><span class="pref-slider"></span></label></div>';
		cb.innerHTML = '<div class="pref-row"><div class="pref-info"><div class="pref-title">Change Navigation Bar Location</div><div class="pref-desc">Press and hold the navigation bar to drag it to a different position.</div></div></div>' +
			sRow('similarShowcase', 'Similar Titles Row', 'Displays recommendation inside info page.', 'pref-similar-showcase') +
			sRow('cwWideCard', 'Continue Watching Card', 'Shows resume cards instead of standard posters.', 'pref-cw-wide-card') +
			sRow('titleLogo', 'Title Logo Image', 'Shows visual logo art on title instead of header text.', 'pref-title-logo') +
			sRow('showBackdrop', 'Info Backdrop', 'Renders backdrop imagery inside info page.', 'pref-show-backdrop') +
			qRow('backdropQuality', 'Banner & Backdrop Quality', 'Resolution for banner and backdrop imagery.', 'pref-backdrop-quality') +
			qRow('posterQuality', 'Poster Quality', 'Resolution for poster art, catalog, and preview.', 'pref-poster-quality', [{
				v: 'low',
				l: 'Low'
			}, {
				v: 'mid',
				l: 'Medium'
			}, {
				v: 'high',
				l: 'High'
			}, {
				v: 'vhigh',
				l: 'Very High'
			}]) +
			qRow('logoQuality', 'Title Logo Quality', 'Resolution for show and movie logo artwork.', 'pref-logo-quality', [{
				v: 'low',
				l: 'Low'
			}, {
				v: 'mid',
				l: 'Medium'
			}, {
				v: 'high',
				l: 'High'
			}, {
				v: 'vhigh',
				l: 'Very High'
			}]) +
			sRow('turnOffAutoSlide', 'Turn Off Homepage Auto Slide', 'Disables auto-scrolling for homepage rows.', 'pref-turn-off-auto-slide') +
			sRow('turnOffAnim', 'Turn Off Animations', 'Disables transitions, card zooms, and movements.', 'pref-turn-off-anim');
	},
	renderStorageModal: function() {
		const sb = this.$g('storage-body');
		if (!sb) return;
		const actRow = (title, desc, type) => `<div class="pref-row"><div class="pref-info"><div class="pref-title">${title}</div><div class="pref-desc">${desc}</div></div><button type="button" class="storage-action-btn" onclick="app.showCustomPrompt('${type}')" title="${title}">${TRASH_SVG}</button></div>`;
		sb.innerHTML = `<div id="storage-stats-container" class="pref-row" style="opacity:0.85;font-size:0.85rem;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px 14px;"><div id="storage-stat-cache">Data Cache: Calculating...</div><div id="storage-stat-user">User Data: Calculating...</div></div>
${actRow('Clear Data Cache', 'Removes stored API responses, metadata, and search results. Keeping this cache helps the app load faster and reduces data usage, though it is safe to clear while preserving saved lists and history.', 'clear_cache')}
${actRow('Reset User Data', 'Permanently erases all saved preferences, custom lists, watch history, and caches, returning the app to its default state.', 'reset_default')}`;
		this.updateStorageStats();
	},
	updateStorageStats: function() {
		const formatBytes = (b) => {
			if (!b || b < 0) b = 0;
			if (b < 1024) return b + ' B';
			if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
			if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
			return (b / 1073741824).toFixed(2) + ' GB';
		};
		const cacheLsKeys = new Set(['meta_details_cache', 'cached_home_showcase', 'tmdb_genres_cache', 'tmdb_countries_cache', 'tmdb_languages_cache', 'sh_recent_searches']);
		let jsUserBytes = 0;
		let jsLsCacheBytes = 0;
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k) continue;
			const sz = (k.length + (localStorage.getItem(k) || '').length) * 2;
			if (k.startsWith('str_c_') || cacheLsKeys.has(k)) jsLsCacheBytes += sz;
			else jsUserBytes += sz;
		}
		const uEl = this.$g('storage-stat-user');
		if (uEl) uEl.innerText = `User Data: ${formatBytes(jsUserBytes)}`;
		const cEl = this.$g('storage-stat-cache');
		if (cEl) cEl.innerText = `Data Cache: ${formatBytes(jsLsCacheBytes)}`;
	},
	renderExploreHub: function() {
		const eh = this.$g('explore-hub');
		if (!eh) return;
		eh.innerHTML = `
<div class="explore-split-card">
<div class="explore-card explore-split-half explore-card-series" onclick="app.selectExploreCategory('tv')"><div class="explore-collage" id="explore-series-collage"></div><div class="explore-card-overlay"></div><div class="explore-card-glow"></div><div class="explore-card-content"><div class="explore-card-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-4 4.5L8 2"/><rect width="20" height="13" x="2" y="6.5" rx="2.5"/><path d="M6 22h12"/></svg></div><div class="explore-card-title">Shows</div><div class="explore-card-subtitle">Series, Dramas, & More</div></div></div>
<div class="explore-card explore-split-half explore-card-movies" onclick="app.selectExploreCategory('movie')"><div class="explore-collage" id="explore-movies-collage"></div><div class="explore-card-overlay"></div><div class="explore-card-glow"></div><div class="explore-card-content"><div class="explore-card-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="3"/><path d="M7 2v20M17 2v20M2 6h5M17 6h5M2 10h5M17 10h5M2 14h5M17 14h5M2 18h5M17 18h5"/><polygon fill="currentColor" stroke="currentColor" stroke-width="1" points="10 9 15 12 10 15"/></svg></div><div class="explore-card-title">Movies</div><div class="explore-card-subtitle">Blockbusters, Classics, & More</div></div></div>
</div>
<div class="explore-split-card">
<div class="explore-card explore-split-half explore-card-companies" onclick="app.selectExploreCategory('company')"><div class="explore-collage" id="explore-companies-collage"></div><div class="explore-card-overlay"></div><div class="explore-card-glow"></div><div class="explore-card-content"><div class="explore-card-icon">${COMPANY_SVG}</div><div class="explore-card-title">Companies</div><div class="explore-card-subtitle">Networks, Studios, & More</div></div></div>
<div class="explore-card explore-split-half explore-card-people" onclick="app.selectExploreCategory('person')"><div class="explore-collage" id="explore-people-collage"></div><div class="explore-card-overlay"></div><div class="explore-card-glow"></div><div class="explore-card-content"><div class="explore-card-icon">${PICTURE_SVG}</div><div class="explore-card-title">People</div><div class="explore-card-subtitle">Actors, Filmmakers, & More</div></div></div>
</div>`;
	},
	renderWatchControls: function() {
		const wc = this.$g('w-controls-bar');
		if (!wc) return;
		wc.innerHTML = `
<button class="w-btn w-btn-icon w-collapse-btn" id="w-col-left-btn" onclick="app.toggleCollapse('left')">${EXPAND_LEFT_SVG(18)}</button>
<button class="w-btn w-btn-icon w-collapse-btn" id="w-col-up-btn" onclick="app.toggleCollapse('up')">${EXPAND_UP_SVG(18)}</button>
<div class="w-controls-left">
<button class="w-btn w-btn-icon" id="w-back-btn" onclick="app.goBack()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 8V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3"/><polyline points="7 7 2 12 7 17"/><line x1="2" y1="12" x2="16" y2="12"/></svg></button>
<button class="w-btn w-btn-icon" id="w-refresh-btn" onclick="app.refreshPlayer()"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg></button>
<button class="w-btn w-btn-icon" id="w-menu-btn" onclick="app.toggleWatchMenu('ep', event)"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v1a1 1 0 0 0 1 1h16a1 1 0 0 1 1-1V2M3 22v-1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1" /><rect width="18" height="10" x="3" y="7" rx="2" /></svg></button>
</div>
<div class="w-controls-right">
<button class="w-btn w-btn-icon" id="w-gear-btn" onclick="app.toggleWatchMenu('server', event)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
<button class="w-btn w-btn-icon" id="w-prev-btn" onclick="app.watchNextPrev(-1)"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button>
<button class="w-btn w-btn-icon" id="w-next-btn" onclick="app.watchNextPrev(1)"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
<button class="w-btn w-btn-icon" id="w-fs-btn" onclick="app.toggleFullscreen()"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>
</div>
<button class="w-btn w-btn-icon w-collapse-btn" id="w-col-down-btn" onclick="app.toggleCollapse('down')">${EXPAND_DOWN_SVG(18)}</button>
<button class="w-btn w-btn-icon w-collapse-btn" id="w-col-right-btn" onclick="app.toggleCollapse('right')">${EXPAND_RIGHT_SVG(18)}</button>
<div class="w-menu-panel" id="w-ep-panel" onclick="event.stopPropagation()"><select class="w-select" id="w-season-sel" onchange="app.watchChangeSeason(this.value)"></select><select class="w-select" id="w-ep-sel" onchange="app.watchChangeEpisode(this.value)"></select></div>
<div class="w-menu-panel" id="w-server-panel" onclick="event.stopPropagation()"><select class="w-select" id="w-player-type-sel" onchange="app.watchChangeType(this.value)" style="display:none;"></select><select class="w-select" id="w-server-num-sel" onchange="app.watchChangeServer(this.value)"></select></div>`;
	},
	renderModals: function() {
		const mc = this.$g('dynamic-modals-container');
		if (!mc) return;
		const modals = [
			['customize', 'Customize', 'customize-box', '<div class="customize-body" id="customize-body"></div>'],
			['storage', 'Data & Storage', 'customize-box', '<div class="customize-body" id="storage-body"></div>'],
			['about', 'Disclaimer', 'about-box', ' <div class="about-body"><div class="about-card"><p>This site is an open-source media indexer and catalog designed to provide a personalized, customizable browsing experience. All title details, metadata, and artwork are aggregated automatically via third-party services and public APIs. This site does not use cookies. All watchlists, preferences, history, and API caches are saved locally using browser localStorage.</p></div><div class="about-card"><p>This project uses the TMDB API but is not endorsed or certified by TMDB.</p></div><div class="about-card"><p>This site is a client-side web application that does not host, store, upload, restream, or re-broadcast any video files or media content. All playback is provided entirely by independent, unaffiliated third-party services via external iframe embeds. This site acts solely as a user interface and has no control over, ownership of, or affiliation with the content, cookies, or advertisements operated by external servers.</p></div><div class="about-card"><p>This site is provided "as is" without warranties of any kind, either express or implied. No guarantees are made regarding the availability, accuracy, safety, or legality of third-party APIs or external embedded content. Use is entirely at your own risk, and users are solely responsible for their interactions with any third-party services accessed through this site.</p></div></div>']
		];
		const h = [];
		for (let i = 0; i < modals.length; i++) {
			const m = modals[i];
			h.push('<div id="' + m[0] + '-modal" class="custom-prompt-overlay" onclick="app.toggleAppModal(\'' + m[0] + '\',false,event)"><div class="' + m[2] + '" onclick="event.stopPropagation()"><div class="customize-header"><div class="customize-title">' + m[1] + '</div><button type="button" class="sheet-close-btn" onclick="app.toggleAppModal(\'' + m[0] + '\',false,event)">&times;</button></div>' + m[3] + '</div></div>');
		}
		h.push('<div id="trailer-modal"><div class="trailer-modal-content" onclick="event.stopPropagation()"><button class="trailer-close-btn" onclick="app.closeTrailer(null)">&times;</button><div class="trailer-iframe-wrapper"><div class="dots-loader" id="trailer-loader" style="display:none;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><iframe id="trailer-iframe" src="" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div></div></div>');
		h.push('<div class="custom-prompt-overlay" id="custom-prompt" onclick="app.closeCustomPrompt(event)" onwheel="event.preventDefault()"><div class="custom-prompt-box" onclick="event.stopPropagation()"><div class="custom-prompt-title">Confirm Action</div><div class="custom-prompt-msg" id="custom-prompt-msg">Are you sure?</div><div class="custom-prompt-actions"><button class="custom-prompt-btn cancel" onclick="app.closeCustomPrompt()">Cancel</button><button class="custom-prompt-btn confirm" id="custom-prompt-confirm-btn">OK</button></div></div></div>');
		h.push('<div id="lucky-modal" onclick="app.cancelLucky(false,event)"><div class="lucky-modal-wrapper"><div class="lucky-tooltip" id="lucky-tooltip"><span class="lucky-tooltip-text">Randomly picks a movie or show based on current filters</span><button type="button" class="lucky-tooltip-close" onclick="app.dismissLuckyTooltip()">&times;</button></div><div class="lucky-box"><button type="button" class="lucky-close-btn" onclick="app.cancelLucky()">&times;</button><div class="lucky-poster-wrap" id="lucky-poster-wrap"><img id="lucky-poster" class="lucky-poster-img" src=""></div><div class="lucky-title" id="lucky-title">Rolling the reels...</div><div class="lucky-actions"><button type="button" class="lucky-roll-btn" id="lucky-roll-btn" onclick="app.startFeelingLucky()" style="display:none;">Roll Again</button><button type="button" class="lucky-watch-btn" id="lucky-watch-btn" onclick="app.openLuckyShow()" style="display:none;">Watch</button></div></div></div></div>');
		h.push('<div id="media-lightbox-modal" onclick="app.closeMediaLightbox(event)"><div class="dots-loader" id="media-lightbox-loader" style="display:none;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="media-lightbox-content" onclick="event.stopPropagation()"><img id="media-lightbox-img" class="media-lightbox-img" src="" alt="Media Preview"></div></div>');
		mc.innerHTML = h.join('');
	},
	fetchShowMedia(movieData) {
		return this.fetchMovieMedia(movieData);
	},
	getMediaPageCapacity() {
		const w = window.innerWidth;
		const isPortrait = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
		if (isPortrait && w <= 800) return 4;
		return 6;
	},
	navigateMovieMedia(direction) {
		const capacity = this.getMediaPageCapacity();
		const totalPages = Math.ceil(this.movieMediaState.items.length / capacity);
		const targetPage = this.movieMediaState.page + direction;
		if (targetPage >= 0 && targetPage < totalPages) {
			this.renderMovieMediaSet(targetPage);
		}
	},
	toggleMediaViewer() {
		return this.toggleMovieMedia();
	},
	toggleVoteFluctuate(btn, targetId) {
		const target = this.$g(targetId);
		if (!target) return;
		const isActive = target.classList.contains('active');
		document.querySelectorAll('.vote-fluctuate-msg.active, .ep-vote-fluctuate-msg.active').forEach(el => el.classList.remove('active'));
		document.querySelectorAll('.rating-hint-btn.active').forEach(el => el.classList.remove('active'));
		if (!isActive) {
			target.classList.add('active');
			if (btn) btn.classList.add('active');
		}
	},
});
window.app = app;
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
	try {
		app.renderFilterBars();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderOptionsSheet();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderModals();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderCustomizeModal();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderStorageModal();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderExploreHub();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderWatchControls();
	} catch (e) {
		console.error(e);
	}
	try {
		app.renderStaticIcons();
	} catch (e) {
		console.error(e);
	}
	app.init();
});