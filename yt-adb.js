/**
 * YouTube Ad Blocker for Shadowrocket
 * Based on TizenTube Cobalt's adblock.js approach
 *
 * TizenTube intercepts JSON.parse() inside the app to strip:
 *   adPlacements, playerAds, adSlots, adSlotRenderer,
 *   paidContentOverlay, youThereRenderer
 *
 * Since Shadowrocket intercepts at the network level (where YouTube
 * uses protobuf, not JSON), this script parses protobuf binary
 * and strips the same ad-related fields.
 *
 * PlayerResponse protobuf field numbers (reverse-engineered):
 *   Field 10 = adPlacements (repeated AdPlacement)
 *   Field 20 = adSlots      (repeated AdSlot)
 *   Field 53 = playerAds    (PlayerAds)
 */

const PLAYER_AD_FIELDS = new Set([10, 20, 53]);

// ===== Protobuf Utilities =====

function readVarint(buf, pos) {
    var result = 0;
    var shift = 0;
    while (pos < buf.length) {
        var byte = buf[pos++];
        result |= (byte & 0x7F) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
        if (shift >= 35) {
            while (pos < buf.length && (buf[pos] & 0x80)) pos++;
            if (pos < buf.length) pos++;
            break;
        }
    }
    return { value: result >>> 0, pos: pos };
}

/**
 * Parse top-level protobuf fields into an array of
 * { fieldNumber, wireType, start, end } entries.
 */
function parseTopLevelFields(buf) {
    var fields = [];
    var pos = 0;

    while (pos < buf.length) {
        var start = pos;

        var tag = readVarint(buf, pos);
        pos = tag.pos;
        var fieldNumber = tag.value >>> 3;
        var wireType = tag.value & 0x7;

        switch (wireType) {
            case 0: // varint
                while (pos < buf.length && (buf[pos++] & 0x80)) {}
                break;
            case 1: // 64-bit fixed
                pos += 8;
                break;
            case 2: // length-delimited
                var len = readVarint(buf, pos);
                pos = len.pos + len.value;
                break;
            case 5: // 32-bit fixed
                pos += 4;
                break;
            default:
                return fields;
        }

        if (pos > buf.length) break;
        fields.push({ fieldNumber: fieldNumber, wireType: wireType, start: start, end: pos });
    }

    return fields;
}

/**
 * Remove all fields with the given field numbers from a protobuf buffer.
 * Returns a new Uint8Array with those fields stripped out.
 */
function stripFields(buf, fieldsToRemove) {
    var parsed = parseTopLevelFields(buf);

    var outputSize = 0;
    for (var i = 0; i < parsed.length; i++) {
        if (!fieldsToRemove.has(parsed[i].fieldNumber)) {
            outputSize += (parsed[i].end - parsed[i].start);
        }
    }

    var result = new Uint8Array(outputSize);
    var offset = 0;
    for (var i = 0; i < parsed.length; i++) {
        if (!fieldsToRemove.has(parsed[i].fieldNumber)) {
            var chunk = buf.subarray(parsed[i].start, parsed[i].end);
            result.set(chunk, offset);
            offset += chunk.length;
        }
    }

    return result;
}

// ===== TizenTube-Style JSON Ad Stripping =====

/**
 * Mirrors TizenTube's adblock.js JSON.parse hook.
 * Strips ad-related fields from a parsed YouTube API response.
 */
function stripAdsJSON(obj) {
    if (obj.adPlacements) obj.adPlacements = [];
    if (obj.playerAds) obj.playerAds = [];
    if (obj.adSlots) obj.adSlots = [];
    if (obj.paidContentOverlay) obj.paidContentOverlay = null;

    // Strip adSlotRenderer from browse/search shelf contents
    if (obj.contents) {
        stripAdRenderers(obj.contents);
    }
    if (obj.onResponseReceivedActions) {
        for (var i = 0; i < obj.onResponseReceivedActions.length; i++) {
            var action = obj.onResponseReceivedActions[i];
            if (action.appendContinuationItemsAction) {
                stripAdRenderers(action.appendContinuationItemsAction);
            }
        }
    }

    // Strip "Are you still watching?" prompts
    if (obj.overlay && obj.overlay.youThereRenderer) {
        delete obj.overlay.youThereRenderer;
    }

    return obj;
}

function stripAdRenderers(container) {
    if (!container) return;
    if (Array.isArray(container)) {
        for (var i = container.length - 1; i >= 0; i--) {
            if (container[i] && container[i].adSlotRenderer) {
                container.splice(i, 1);
            } else {
                stripAdRenderers(container[i]);
            }
        }
    } else if (typeof container === 'object') {
        for (var key in container) {
            if (key === 'adSlotRenderer') {
                delete container[key];
            } else if (container[key] && typeof container[key] === 'object') {
                stripAdRenderers(container[key]);
            }
        }
    }
}

// ===== Main =====

(function () {
    try {
        var body = $response.body;
        if (!body) {
            $done({});
            return;
        }

        var data;
        if (body instanceof Uint8Array) {
            data = body;
        } else if (body instanceof ArrayBuffer) {
            data = new Uint8Array(body);
        } else {
            $done({});
            return;
        }

        if (data.length === 0) {
            $done({});
            return;
        }

        // Detect JSON (starts with '{') vs protobuf (binary)
        if (data[0] === 0x7B) {
            // JSON response — use TizenTube's exact approach
            var text = '';
            for (var i = 0; i < data.length; i++) {
                text += String.fromCharCode(data[i]);
            }
            var json = JSON.parse(text);
            stripAdsJSON(json);
            var cleaned = JSON.stringify(json);
            $done({ body: cleaned });
        } else {
            // Protobuf response — strip ad fields by field number
            var url = $request.url;

            if (url.indexOf('/player') !== -1) {
                // PlayerResponse: strip adPlacements(10), adSlots(20), playerAds(53)
                var result = stripFields(data, PLAYER_AD_FIELDS);
                $done({ body: result.buffer });
            } else {
                // browse/next/search/guide — protobuf ad stripping for nested
                // content is complex; URL-level blocking handles these
                $done({});
            }
        }
    } catch (e) {
        // On any error, pass through unmodified
        $done({});
    }
})();
