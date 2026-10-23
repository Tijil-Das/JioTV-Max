import http from 'node:http'
import { castLogger } from './logger'

/**
 * DIAL (Discovery And Launch) protocol client.
 * Attempts to launch the native Smart TV web browser (Samsung Tizen, LG webOS, generic)
 * directly opening the Web Receiver page.
 */
export async function launchDialBrowser(tvHost: string, receiverUrl: string): Promise<boolean> {
  const dialPorts = [8001, 8080, 8008]
  const appNames = [
    'org.tizen.browser',
    'com.webos.app.browser',
    'Browser',
    'WebBrowser'
  ]

  for (const port of dialPorts) {
    for (const app of appNames) {
      const success = await attemptDialPost(tvHost, port, app, receiverUrl)
      if (success) {
        castLogger.info(`[DIAL] Successfully launched ${app} on ${tvHost}:${port} with ${receiverUrl}`)
        return true
      }
    }
  }
  return false
}

function attemptDialPost(host: string, port: number, appName: string, targetUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const postData = `url=${encodeURIComponent(targetUrl)}`
    const req = http.request(
      {
        hostname: host,
        port,
        path: `/apps/${appName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 2000
      },
      (res) => {
        // DIAL specification returns 201 Created on app launch, or 200 OK
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve(true)
        } else {
          resolve(false)
        }
      }
    )

    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.write(postData)
    req.end()
  })
}
