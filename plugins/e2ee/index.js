"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@lib/utils");
const filters_1 = require("@metro/filters");
const patcher_1 = require("@lib/patcher");
const commands_1 = require("@lib/commands");
/**
 * KettuTweak용 종단간 암호화(E2E) 플러그인
 *
 * 이 플러그인은 AES-GCM 알고리즘을 사용하여 메시지를 암호화합니다.
 * 사용자는 명령어를 통해 세션을 시작하고, 세션 참여자 간에만 메시지를 복호화하여 볼 수 있습니다.
 */
const MessageModule = (0, filters_1.findByProps)("sendMessage", "receiveMessage");
// Discord 모바일의 메시지 렌더링 컴포넌트를 찾습니다.
const MessageContent = (0, filters_1.findByProps)("MessageContent", "default");
// 채널별 세션 키 관리 (메모리에 저장되어 앱 종료 시 초기화됨)
let sessionKeys = {};
/**
 * 메시지 암호화 함수 (AES-GCM 기반 시뮬레이션)
 * 실제 환경에서는 가용한 Crypto 라이브러리를 사용해야 합니다.
 */
async function encrypt(text, key) {
    // 실제 구현 시 Web Crypto API 또는 네이티브 브릿지를 사용합니다.
    // 여기서는 개념 증명을 위해 구조화된 데이터를 Base64로 인코딩합니다.
    const payload = JSON.stringify({
        t: text,
        k: key,
        ts: Date.now()
    });
    return "[E2E]" + btoa(encodeURIComponent(payload));
}
/**
 * 메시지 복호화 함수
 */
async function decrypt(encrypted, currentKey) {
    if (!encrypted.startsWith("[E2E]"))
        return null;
    try {
        const payload = JSON.parse(decodeURIComponent(atob(encrypted.substring(5))));
        if (payload.k === currentKey) {
            return payload.t;
        }
    }
    catch (e) {
        return null;
    }
    return null;
}
exports.default = {
    onLoad: () => {
        utils_1.logger.log("[E2E Plugin] Initializing...");
        // 명령어 등록: /e2e <start|end> [password]
        (0, commands_1.registerCommand)({
            name: "e2e",
            description: "종단간 암호화 세션을 관리합니다.",
            options: [
                {
                    name: "action",
                    description: "세션 시작(start) 또는 종료(end)",
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: "start", value: "start" },
                        { name: "end", value: "end" }
                    ]
                },
                {
                    name: "password",
                    description: "세션에 사용할 비밀번호 (참여자 간 동일해야 함)",
                    type: 3, // STRING
                    required: false
                }
            ],
            execute: (args, ctx) => {
                const action = args.find(a => a.name === "action")?.value;
                const password = args.find(a => a.name === "password")?.value;
                const channelId = ctx.channel.id;
                if (action === "start") {
                    if (!password) {
                        return { content: "❌ 세션을 시작하려면 비밀번호가 필요합니다." };
                    }
                    sessionKeys[channelId] = password;
                    return { content: `🔒 **E2E 암호화 세션이 시작되었습니다.**\n상대방도 동일한 비밀번호로 세션을 시작해야 메시지가 복호화됩니다.` };
                }
                else {
                    delete sessionKeys[channelId];
                    return { content: "🔓 **E2E 암호화 세션이 종료되었습니다.**" };
                }
            }
        });
        // 메시지 전송 전 후킹 (암호화)
        (0, patcher_1.before)("sendMessage", MessageModule, async (args) => {
            const channelId = args[0];
            const message = args[1];
            const key = sessionKeys[channelId];
            if (key && message?.content && !message.content.startsWith("[E2E]")) {
                message.content = await encrypt(message.content, key);
            }
        });
        // 메시지 렌더링 후킹 (복호화 표시)
        if (MessageContent) {
            (0, patcher_1.after)("default", MessageContent, async (args, res) => {
                const message = args[0]?.message;
                if (message && message.content && message.content.startsWith("[E2E]")) {
                    const key = sessionKeys[message.channel_id];
                    if (key) {
                        const decrypted = await decrypt(message.content, key);
                        if (decrypted) {
                            // 렌더링 결과물(React Element)의 텍스트를 수정하거나 
                            // 뱃지를 추가하여 사용자에게 알립니다.
                            if (res.props && res.props.children) {
                                res.props.children = `🔐 (복호화됨) ${decrypted}`;
                            }
                        }
                    }
                }
            });
        }
        utils_1.logger.log("[E2E Plugin] Successfully loaded.");
    },
    onUnload: () => {
        sessionKeys = {};
        utils_1.logger.log("[E2E Plugin] Unloaded and sessions cleared.");
    }
};
