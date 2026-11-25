const srv = (name, host, m, tv, opts = {}) => ({
  name,
  movie: (id) => `https://${host}${m(id)}`,
  tv: (id, s, e) => `https://${host}${tv(id, s, e)}`,
  ...opts,
});
const P_EMBED_M = (id) => `/embed/movie/${id}`;
const P_EMBED_TV = (id, s, e) => `/embed/tv/${id}/${s}/${e}`;
const P_PLAIN_M = (id) => `/movie/${id}`;
const P_PLAIN_TV = (id, s, e) => `/tv/${id}/${s}/${e}`;
const P_WATCH_M = (id) => `/watch/movie/${id}`;
const P_WATCH_TV = (id, s, e) => `/watch/tv/${id}/${s}/${e}`;
const embedServers = {
  1: srv(
    "Example 1",
    "www.example.com",
    P_EMBED_M,
    (id, s, e) => `/embed/tv/${id}/${s}/${e}`,
  ),
  2: srv(
    "Example 2",
    "www.example.com",
    (id) => `/movie/${id}?autoplay=true`,
    (id, s, e) => `/tv/${id}/${s}/${e}`,
  ),
};
const animeServers = {
  sub: {
    1: {
      name: "Example 1",
      url: (mal, ani, ep) =>
        `https://www.example.com/stream/mal/${mal}/${ep}/sub`,
    },
    2: {
      name: "Example 2",
      url: (mal, ani, ep) =>
        `https://www.example.com/stream/ani/${ani}/${ep}/sub`,
    },
  },
  dub: {
    1: {
      name: "Example 1",
      url: (mal, ani, ep) =>
        `https://www.example.com/stream/mal/${mal}/${ep}/dub`,
    },
    2: {
      name: "Example 2",
      url: (mal, ani, ep) =>
        `https://www.example.com/stream/ani/${ani}/${ep}/dub`,
    },
  },
};
if (typeof window !== "undefined") {
  window.srv = srv;
  window.embedServers = embedServers;
  window.animeServers = animeServers;
}
