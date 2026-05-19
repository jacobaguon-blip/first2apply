// Builds a `.shortcut` (binary plist) file with the user's endpoint + token
// pre-filled, serves it from an ephemeral local HTTP server, and returns a
// LAN URL + QR code so the user can scan-and-install on their iPhone.
//
// Caveat: iOS requires "Allow Untrusted Shortcuts" to be enabled in
// Settings → Shortcuts before unsigned shortcuts can be installed.

import bplistCreator from 'bplist-creator';
import { createServer, Server } from 'http';
import { networkInterfaces } from 'os';
import QRCode from 'qrcode';
import { randomBytes, randomUUID } from 'crypto';

import { ILogger } from './logger';

const SERVER_TTL_MS = 5 * 60 * 1000; // 5 minutes

function lanIP(): string | null {
  const ifs = networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function tokenString(s: string) {
  return {
    Value: { string: s, attachmentsByRange: {} },
    WFSerializationType: 'WFTextTokenString',
  };
}

function tokenStringWithShortcutInput() {
  // Magic variable: Shortcut Input. The placeholder character ￼
  // (Object Replacement Character) marks where the variable is inserted.
  return {
    Value: {
      string: '￼',
      attachmentsByRange: {
        '{0, 1}': {
          Type: 'ExtensionInput',
          OutputName: 'Shortcut Input',
        },
      },
    },
    WFSerializationType: 'WFTextTokenString',
  };
}

function dictionaryField(items: Array<{ key: string; value: ReturnType<typeof tokenString> }>) {
  return {
    Value: {
      WFDictionaryFieldValueItems: items.map((it) => ({
        WFItemType: 0,
        WFKey: tokenString(it.key),
        WFValue: it.value,
      })),
    },
    WFSerializationType: 'WFDictionaryFieldValue',
  };
}

export function buildShortcutPlist({ endpoint, token }: { endpoint: string; token: string }): Buffer {
  const workflow = {
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowClientVersion: '2607.0.4.1',
    WFWorkflowClientRelease: '2.0',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 463140863, // a blue
      WFWorkflowIconGlyphNumber: 59511,
    },
    WFWorkflowImportQuestions: [] as unknown[],
    WFWorkflowInputContentItemClasses: [
      'WFAppContentItem',
      'WFAppStoreAppContentItem',
      'WFArticleContentItem',
      'WFContactContentItem',
      'WFDateContentItem',
      'WFEmailAddressContentItem',
      'WFFolderContentItem',
      'WFGenericFileContentItem',
      'WFImageContentItem',
      'WFiTunesProductContentItem',
      'WFLocationContentItem',
      'WFDCMapsLinkContentItem',
      'WFAVAssetContentItem',
      'WFPDFContentItem',
      'WFPhoneNumberContentItem',
      'WFRichTextContentItem',
      'WFSafariWebPageContentItem',
      'WFStringContentItem',
      'WFURLContentItem',
    ],
    WFWorkflowOutputContentItemClasses: [] as unknown[],
    WFWorkflowHasOutputFallback: false,
    WFWorkflowHasShortcutInputVariables: false,
    WFWorkflowTypes: ['ActionExtension'],
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          WFURL: endpoint,
          WFHTTPMethod: 'POST',
          ShowHeaders: true,
          WFHTTPHeaders: dictionaryField([
            { key: 'x-f2a-token', value: tokenString(token) },
            { key: 'Content-Type', value: tokenString('application/json') },
          ]),
          WFHTTPBodyType: 'JSON',
          WFJSONValues: dictionaryField([{ key: 'url', value: tokenStringWithShortcutInput() }]),
          UUID: randomUUID(),
        },
      },
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
        WFWorkflowActionParameters: {
          WFNotificationActionBody: 'Queued for First 2 Apply',
          WFNotificationActionTitle: 'First 2 Apply',
          WFNotificationActionSound: true,
          UUID: randomUUID(),
        },
      },
    ],
  };

  return bplistCreator(workflow);
}

export type InstallPayload = {
  url: string;
  qrPngDataUrl: string;
  expiresAt: number;
};

export class ShortcutInstallServer {
  private server: Server | null = null;
  private timer: NodeJS.Timeout | null = null;
  private token: string | null = null;

  constructor(private readonly logger: ILogger) {}

  async start({ endpoint, token }: { endpoint: string; token: string }): Promise<InstallPayload> {
    this.stop();
    const file = buildShortcutPlist({ endpoint, token });
    const path = '/' + randomBytes(12).toString('hex') + '.shortcut';
    this.token = path;

    const ip = lanIP();
    if (!ip) throw new Error('no-lan-ip');

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.url === path) {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="First2Apply.shortcut"',
            'Content-Length': String(file.length),
          });
          res.end(file);
          this.logger.info('shortcut file served');
        } else {
          res.writeHead(404);
          res.end('not found');
        }
      });

      this.server.on('error', (e) => {
        this.logger.error(`install server error: ${e.message}`);
        reject(e);
      });

      this.server.listen(0, ip, async () => {
        const addr = this.server!.address();
        if (typeof addr !== 'object' || !addr) {
          reject(new Error('no-address'));
          return;
        }
        const url = `http://${ip}:${addr.port}${path}`;
        const expiresAt = Date.now() + SERVER_TTL_MS;

        this.timer = setTimeout(() => {
          this.logger.info('install server timed out');
          this.stop();
        }, SERVER_TTL_MS);

        try {
          const qrPngDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1 });
          resolve({ url, qrPngDataUrl, expiresAt });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.token = null;
  }
}
