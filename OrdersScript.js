var ServiceLayerContext = require('ServiceLayerContext.js');
var http = require('HttpModule.js');

function POST() { 
    var slContext = new ServiceLayerContext();
    var orderData;

    // 0. 尝试解析 JSON，如果语法破坏，则返回 SAP B1 标准错误结构
    try {
        orderData = http.request.getJsonObj();
        
        // 拦截空数据或完全空的 JSON 对象 {}
        if (!orderData || Object.keys(orderData).length === 0) {
            throw new Error("Payload is empty or null.");
        }
    } catch (e) {
        var nativeFormatError = {
            "error": {
                "code": -1, 
                "message": {
                    "lang": "en-us",
                    "value": "Error parsing JSON payload: " + e.message
                }
            }
        };
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, nativeFormatError);
        return; 
    }

    // 1. 收集所有需要查询的 ItemCode
    var itemCodesToQuery = [];
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var i = 0; i < orderData.DocumentLines.length; i++) {
            var line = orderData.DocumentLines[i];
            if (line.ItemCode && !line.U_ItemGG) {
                if (itemCodesToQuery.indexOf(line.ItemCode) === -1) {
                    itemCodesToQuery.push(line.ItemCode);
                }
            }
        }
    }

    // 2. 批量查询物料规格
    var itemSpecMap = {}; 
    if (itemCodesToQuery.length > 0) {
        try {
            var filterParts = [];
            for(var j = 0; j < itemCodesToQuery.length; j++){
                // 【终极修复】：处理物料编码中可能包含单引号的边界情况，避免 OData 语法错误
                var safeItemCode = itemCodesToQuery[j].replace(/'/g, "''");
                filterParts.push("ItemCode eq '" + safeItemCode + "'");
            }
            var filterStr = filterParts.join(" or ");
            var queryUrl = "$select=ItemCode,U_ItemGG&$filter=" + filterStr;

            var queryRes = slContext.query("Items", queryUrl, false); 
            var dbItems = queryRes.toArray();

            if (dbItems && dbItems.length > 0) {
                for (var k = 0; k < dbItems.length; k++) {
                    var dbItem = dbItems[k];
                    if (dbItem.ItemCode && dbItem.U_ItemGG) {
                        itemSpecMap[dbItem.ItemCode] = dbItem.U_ItemGG;
                    }
                }
            }
        } catch (e) {
            console.log("Batch query failed: " + e.message); 
        }
    }

    // 3. 内存赋值，补全规格
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var m = 0; m < orderData.DocumentLines.length; m++) {
            var updateLine = orderData.DocumentLines[m];
            if (updateLine.ItemCode && itemSpecMap[updateLine.ItemCode]) {
                updateLine.U_ItemGG = itemSpecMap[updateLine.ItemCode];
            }
        }
    }

    // 4. 提交订单
    slContext.startTransaction();
    var addRes = slContext.Orders.add(orderData); 

    if (addRes.isOK()) {
        slContext.commitTransaction();
        http.response.send(http.HttpStatus.HTTP_CREATED, addRes.body); 
    } else {
        slContext.rollbackTransaction();
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, addRes.body);
    }
}
