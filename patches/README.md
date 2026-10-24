# patches/

Intentionally empty for now. `patch-package` is NOT installed (package.json
belongs to Ч1), so there is no patch pipeline to feed.

Escalation path (agreed in the spike, docs/spike-blocking.md):

1. First choice — upstream plugin option, already filed as a fix-card for Ч1:
   `copyToTargetFolder: false` on the `react-native-device-activity` plugin in
   `app.config.ts`, so the lib stops overwriting the in-repo `targets/**`
   Swift sources on every prebuild.
2. If a lib source change is ever unavoidable (bug inside
   react-native-device-activity), add `patch-package` (devDep + `postinstall`
   script — needs a Ч1 fix-card) and drop the generated patch here.
3. The vendored extension sources under `targets/**` are plain Swift in this
   repo — a hard fork of the whole package is always possible without any
   patch tooling.
