var ServiceLayerContext = require('ServiceLayerContext.js');
var http = require('HttpModule.js');

function POST() {
    var orderData = http.request.getJsonObj();
    var slContext = new ServiceLayerContext();
    
    // 1. 收集所有需要查询的 ItemCode
    var itemCodesToQuery = [];
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var i = 0; i < orderData.DocumentLines.length; i++) {
            var line = orderData.DocumentLines[i];
            // 只收集有编码且没有填规格的行
            if (line.ItemCode && !line.U_ItemGG) {
                // 简单去重，避免重复查询同一个物料
                if (itemCodesToQuery.indexOf(line.ItemCode) === -1) {
                    itemCodesToQuery.push(line.ItemCode);
                }
            }
        }
    }

    // 2. 如果有需要查询的物料，执行批量查询
    // 使用 Map (对象) 来存储结果： { "1001": "规格A", "1002": "规格B" }
    var itemSpecMap = {}; 

    if (itemCodesToQuery.length > 0) {
        try {
            // 构建批量查询 Filter：ItemCode eq 'A' or ItemCode eq 'B' ...
            var filterParts = [];
            for(var j=0; j<itemCodesToQuery.length; j++){
                filterParts.push("ItemCode eq '" + itemCodesToQuery[j] + "'");
            }
            // 注意：如果 ItemCode 很多，这里要注意 URL 长度限制。
            // 生产环境建议每 20-50 个物料分批查询，这里演示简化为一次查完。
            var filterStr = filterParts.join(" or ");
            var queryUrl = "$select=ItemCode,U_ItemGG&$filter=" + filterStr;

            // 执行一次数据库交互
            var res = slContext.query("Items", queryUrl, false);
            var dbItems = res.toArray();

            // 将数据库结果转换为 Map 结构，方便后续精准查找
            if (dbItems && dbItems.length > 0) {
                for (var k = 0; k < dbItems.length; k++) {
                    var dbItem = dbItems[k];
                    if (dbItem.ItemCode && dbItem.U_ItemGG) {
                        // 核心：以 ItemCode 为 Key，建立映射
                        itemSpecMap[dbItem.ItemCode] = dbItem.U_ItemGG;
                    }
                }
            }

        } catch (e) {
            // 记录日志，方便排查
            console.log("Batch query failed: " + e.message);
        }
    }

    // 3. 第二次遍历：利用 Map 进行内存赋值 (速度极快)
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var m = 0; m < orderData.DocumentLines.length; m++) {
            var updateLine = orderData.DocumentLines[m];
            // 如果该行的物料在 Map 中存在规格，则赋值
            // 这种通过 Key 取值的方式是 100% 准确的
            if (updateLine.ItemCode && itemSpecMap[updateLine.ItemCode]) {
                updateLine.U_ItemGG = itemSpecMap[updateLine.ItemCode];
            }
        }
    }

    // 4. 提交订单
    slContext.startTransaction();
    var res = slContext.Orders.add(orderData);

    if (res.isOK()) {
        slContext.commitTransaction();
        http.response.send(http.HttpStatus.HTTP_CREATED, res.body); 
    } else {
        slContext.rollbackTransaction();
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, res.body);
    }
}var ServiceLayerContext = require('ServiceLayerContext.js');
var http = require('HttpModule.js');

function POST() {
    var orderData = http.request.getJsonObj();
    var slContext = new ServiceLayerContext();
    
    // 1. 收集所有需要查询的 ItemCode
    var itemCodesToQuery = [];
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var i = 0; i < orderData.DocumentLines.length; i++) {
            var line = orderData.DocumentLines[i];
            // 只收集有编码且没有填规格的行
            if (line.ItemCode && !line.U_ItemGG) {
                // 简单去重
                if (itemCodesToQuery.indexOf(line.ItemCode) === -1) {
                    itemCodesToQuery.push(line.ItemCode);
                }
            }
        }
    }

    // 用于存储查询结果的 Map
    var itemSpecMap = {}; 

    // 2. 【核心修复】分批查询 (Batch Chunking)
    // 定义每批查询的大小，20 是一个非常安全的数字，保证 URL 不会超长
    var CHUNK_SIZE = 20; 

    if (itemCodesToQuery.length > 0) {
        try {
            // 循环处理，每次步进 20 个
            for (var k = 0; k < itemCodesToQuery.length; k += CHUNK_SIZE) {
                
                // 切片：获取当前这一批的物料编码 (例如第0-20个, 第20-40个...)
                var currentBatch = itemCodesToQuery.slice(k, k + CHUNK_SIZE);
                
                // 构建当前批次的查询 Filter
                var filterParts = [];
                for(var j=0; j < currentBatch.length; j++){
                    // 使用 encodeURIComponent 并没有在内部函数完全实现，所以手动拼接时要注意单引号
                    // 这里假设 ItemCode 不含特殊字符，直接拼接
                    filterParts.push("ItemCode eq '" + currentBatch[j] + "'");
                }
                
                var filterStr = filterParts.join(" or ");
                var queryUrl = "$select=ItemCode,U_ItemGG&$filter=" + filterStr;

                // 执行当前批次的查询
                var res = slContext.query("Items", queryUrl, false);
                var dbItems = res.toArray();

                // 将结果合并到总 Map 中
                if (dbItems && dbItems.length > 0) {
                    for (var m = 0; m < dbItems.length; m++) {
                        var dbItem = dbItems[m];
                        if (dbItem.ItemCode && dbItem.U_ItemGG) {
                            itemSpecMap[dbItem.ItemCode] = dbItem.U_ItemGG;
                        }
                    }
                }
            }

        } catch (e) {
            // 记录错误日志，但不阻断下单
            console.log("Script Error in Batch Query: " + e.message);
        }
    }

    // 3. 内存赋值 (这一步非常快)
    if (orderData.DocumentLines && orderData.DocumentLines.length > 0) {
        for (var n = 0; n < orderData.DocumentLines.length; n++) {
            var updateLine = orderData.DocumentLines[n];
            if (updateLine.ItemCode && itemSpecMap[updateLine.ItemCode]) {
                updateLine.U_ItemGG = itemSpecMap[updateLine.ItemCode];
            }
        }
    }

    // 4. 提交订单
    slContext.startTransaction();
    var res = slContext.Orders.add(orderData);

    if (res.isOK()) {
        slContext.commitTransaction();
        http.response.send(http.HttpStatus.HTTP_CREATED, res.body); 
    } else {
        slContext.rollbackTransaction();
        http.response.send(http.HttpStatus.HTTP_BAD_REQUEST, res.body);
    }
}