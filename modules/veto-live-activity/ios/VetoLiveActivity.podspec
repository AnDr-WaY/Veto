#
#  VetoLiveActivity.podspec
#  Veto — local Expo module (main app target)
#
#  Apple-side autolinking only installs Expo modules that ship a .podspec
#  inside a top-level directory — without this file VetoLiveActivityModule
#  never reaches the binary and the JS seam
#  (src/features/liveActivity/api.ts) reports `missing`.
#

require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VetoLiveActivity'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license'] || 'Apache-2.0'
  s.author         = package['author'] || 'Veto'
  s.homepage       = package['homepage'] || 'https://github.com/AnDr-WaY/Veto'
  # ActivityKit's Live Activity API is iOS 16.1+; the app target already
  # requires 16.4 (Podfile.properties.json), so pin the pod to the same.
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
