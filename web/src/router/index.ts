import { createRouter, createWebHistory } from 'vue-router';

// History API (clean URLs like /album/<slug>). Needs an SPA fallback on the host so deep
// links / refreshes serve index.html — see public/_redirects. Views are lazy-loaded so the
// landing page stays lightweight until sign-in.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'overview', component: () => import('@/views/OverviewView.vue') },
    {
      path: '/album/:slug',
      name: 'album',
      component: () => import('@/views/AlbumView.vue'),
      props: true, // route params → component props (slug)
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
  // Mimic native browser navigation: restore the saved position on back/forward (popstate),
  // otherwise start at the top for forward navigation.
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

export default router;
