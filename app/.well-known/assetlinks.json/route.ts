const TRAKNIO_ANDROID_PACKAGE = "com.traknio.app"
const TRAKNIO_RELEASE_CERTIFICATE_SHA256 =
  "1E:F7:44:14:85:CD:C5:0C:3D:6A:05:82:CC:A0:6F:6D:15:B2:96:6B:C7:0B:56:DB:7E:DF:D5:01:5D:DA:66:E3"

export function GET() {
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: TRAKNIO_ANDROID_PACKAGE,
          sha256_cert_fingerprints: [TRAKNIO_RELEASE_CERTIFICATE_SHA256],
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  )
}
