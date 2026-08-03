// Static content script: WXT registers it from this entrypoint, so it loads on
// every page (all frames) without on-demand injection. The background messages
// it to fill/clear; orchestration is added in a later unit.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    console.log('[input-filler] content script loaded');
  },
});
