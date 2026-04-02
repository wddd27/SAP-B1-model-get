var ServiceLayerContext = require('ServiceLayerContext.js');
var http = require('HttpModule.js');

function POST() { 
    var slContext = new ServiceLayerContext();
    var orderData;

    try {
        orderData = http.request.getJsonObj();
    } catch (e) {
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, { "error": { "code": -1, "message": "JSON Parse Error" } });
        return; 
    }

    try {
        // 1. 物料规格补全（原汁原味的逻辑，仅去重防止查库报错）
        var itemCodesToQuery = [];
        if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
            for (var i = 0; i < orderData.DocumentLines.length; i++) {
                var line = orderData.DocumentLines[i];
                if (line.ItemCode && !line.U_ItemGG) {
                    var safeCode = String(line.ItemCode).replace(/'/g, "''");
                    if (itemCodesToQuery.indexOf(safeCode) === -1) {
                        itemCodesToQuery.push(safeCode);
                    }
                }
            }
        }

        if (itemCodesToQuery.length > 0) {
            var filterParts = [];
            for (var j = 0; j < itemCodesToQuery.length; j++) {
                filterParts.push("ItemCode eq '" + itemCodesToQuery[j] + "'");
            }
            var queryRes = slContext.query("Items", "$select=ItemCode,U_ItemGG&$filter=" + filterParts.join(" or "), false);
            var dbItems = queryRes.toArray();
            
            var itemSpecMap = {};
            for (var k = 0; k < dbItems.length; k++) {
                itemSpecMap[dbItems[k].ItemCode] = dbItems[k].U_ItemGG;
            }

            for (var m = 0; m < orderData.DocumentLines.length; m++) {
                var updateLine = orderData.DocumentLines[m];
                if (updateLine.ItemCode && itemSpecMap[updateLine.ItemCode]) {
                    updateLine.U_ItemGG = itemSpecMap[updateLine.ItemCode];
                }
            }
        }

        // ==========================================
        // 2. 提交订单并安全透传内控模块(TN)的报错
        // ==========================================
        // 绝对不要手动 start/rollback 事务，交给底层自动管理
        var addRes = slContext.Orders.add(orderData); 

        if (addRes.isOK()) {
            http.response.send(http.HttpStatus.HTTP_CREATED, addRes.body); 
        } else {
            // 当内控模块(TN)拦截时，代码会走到这里
            var errorResponse;
            try {
                // 安全解析 B1 抛出的包含 -1116 的 JSON 字符串
                errorResponse = typeof addRes.body === 'string' ? JSON.parse(addRes.body) : addRes.body;
            } catch (parseErr) {
                errorResponse = { "error": { "code": -1, "message": { "value": addRes.body } } };
            }
            // 正常返回 400 状态码，不再引起 502 崩溃
            http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, errorResponse);
        }

    } catch (exception) {
        // 全局兜底：防止极端情况下引擎直接抛出异常
        var exMsg = "Unknown Error";
        try { exMsg = exception.message || String(exception); } catch(e){}
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, {
            "error": { "code": -500, "message": { "value": "Script Error: " + exMsg } }
        });
    }
}
