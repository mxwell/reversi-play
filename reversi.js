/*
  Cell entity:
  - x : Integer
  - y : Integer
  - side : Integer (1 or 2)
*/

Players = new Meteor.Collection("players");
Disks = new Meteor.Collection("disks");
var CELL_SIZE = 33; /* including border at one side */
var CELL_BORDER = 3;
var CELL_CENTER_OFFSET = CELL_BORDER + CELL_SIZE / 2;
var DISK_RADIUS = CELL_SIZE * 0.375;
var DISK_BORDER = 2;
var N = 4;
var GRID_SIZE = (CELL_SIZE) * N + CELL_BORDER;
var BG_COLOR = '#00CC66'; /* nice green */
var GRID_COLOR = '#003366'; /* dark blue */
var DISK_BORDER_COLOR = '#002E5C'; /* medium blue */
var DISK_DARK_SIDE  = '#000000'; /* dark */
var DISK_LIGHT_SIDE = '#FFFFFF'; /* bright */
var VACANT_COLOR = '#00FF00'; /* real green */
var adj = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];
var CELL_IS_VACANT = 3;

if (Meteor.isClient) {
    Meteor.subscribe("disks");
    Meteor.subscribe("players");
    var cells = new Array(N);
    for (var i = 0; i < N; ++i)
        cells[i] = new Array(N);

    var drawGrid = function() {
        var canv = $('#canv')[0];
        var ctx = canv.getContext('2d');
        if (canv.width !== GRID_SIZE || canv.height !== GRID_SIZE) {
            console.log("resizing");
            canv.width = GRID_SIZE;
            canv.height = GRID_SIZE;
            $('#canv').css("width", GRID_SIZE);
            $('#canv').css("height", GRID_SIZE);
            var half = Math.floor(GRID_SIZE / 2);
            $('#first').css("width", half);
            $('#second').css("width", half);
            $('#status').css("width", 2 * half);
        }
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canv.width, canv.height);
        var i;
        ctx.fillStyle = GRID_COLOR;
        for (i = 0; i <= N; ++i) {
            var start = i * CELL_SIZE;
            var end = start + CELL_BORDER;
            ctx.fillRect(0, i * CELL_SIZE, canv.width, CELL_BORDER);
            ctx.fillRect(i * CELL_SIZE, 0, CELL_BORDER, canv.height);
        }
    }

    var drawDisk = function (xId, yId, color, r) {
        console.log("drawDisk");
        var canv = $('#canv')[0];
        var ctx = canv.getContext('2d');
        var centerX = xId * CELL_SIZE + CELL_CENTER_OFFSET;
        var centerY = yId * CELL_SIZE + CELL_CENTER_OFFSET;
        ctx.beginPath();
        if (typeof r === 'undefined')
            r = DISK_RADIUS;
        ctx.arc(centerX, centerY, r, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = DISK_BORDER;
        ctx.strokeStyle = DISK_BORDER_COLOR;
        ctx.stroke();
    }

    var addDisk = function (xi, yi, player) {
        console.log("addDisk");
        if (cells[xi][yi] !== CELL_IS_VACANT) {
            console.log("Cell isn't available");
            return;
        }
        var prev = Disks.findOne({x: xi, y: yi});
        if (prev) {
            console.log("there is a disk already in cell [" + xi + "," + yi + "]");
            return;
        }
        Disks.insert({x: xi, y: yi, side: player});
        var other = 3 - player;
        for (var k = 0; k < adj.length; ++k) {
            var dir = adj[k];
            var nx = xi + dir[0];
            var ny = yi + dir[1];
            if (validCoordinates(nx, ny) && cells[nx][ny] === other) {
                console.log("found interesting: " + nx + "," + ny);
                for (var t = 0; t < N; ++t) {
                    nx += dir[0];
                    ny += dir[1];
                    if (!validCoordinates(nx, ny))
                        break;
                    if (cells[nx][ny] === other)
                        continue;
                    if (cells[nx][ny] === player) {
                        /* ok, flip'em */
                        console.log("and found our color: " + nx + "," + ny);
                        nx -= dir[0];
                        ny -= dir[1];
                        while (!(nx === xi && ny === yi)) {
                            console.log("update in [" + nx + "," + ny + "]");
                            Disks.update({_id: Disks.findOne({x: nx, y: ny})._id},
                                {$set: {side: player}});
                            nx -= dir[0];
                            ny -= dir[1];
                        }
                    }
                    break;
                }
            }
        }
        var first = Players.findOne({id: 1});
        var second = Players.findOne({id: 2});
        Players.update({_id: first._id}, {$set: {active: player != 1}});
        Players.update({_id: second._id}, {$set: {active: player != 2}});
    }

    var validCoordinates = function (i, j) {
        return 0 <= i && i < N && 0 <= j && j < N;
    }

    var markVacant = function (i, j) {
        console.log("Cell [" + i + "," + j + "] is vacant");
        cells[i][j] = CELL_IS_VACANT;
        drawDisk(i, j, VACANT_COLOR, DISK_RADIUS / 5);
    }

    var findVacant = function() {
        console.log("findVacant called");
        var actives = Players.findOne({active: true});
        if (typeof actives === 'undefined') {
            console.log("no active players");
            return;
        }
        var player = 1;
        if (typeof actives !== 'undefined' && actives.id === 2)
            player = 2;
        var other = 3 - player;
        var cnt = 0;
        for (var i = 0; i < N; ++i)
            for (var j = 0; j < N; ++j)
                if (cells[i][j] === player)
                    for (var k = 0; k < adj.length; ++k) {
                        var dir = adj[k];
                        var ni = i + dir[0];
                        var nj = j + dir[1];
                        if (validCoordinates(ni, nj) && cells[ni][nj] === other) {
                            for (var t = 0; t < N; ++t) {
                                ni += dir[0];
                                nj += dir[1];
                                if (!validCoordinates(ni, nj))
                                    break;
                                if (cells[ni][nj] === other)
                                    continue;
                                if (cells[ni][nj] === player)
                                    break;
                                /* Yay! Vacant cell! */
                                if (cells[ni][nj] !== CELL_IS_VACANT) {
                                    markVacant(ni, nj);
                                    ++cnt;
                                }
                                break;
                            }
                        }
                    }
        if (cnt === 0) {
            console.log("No vacant places");
            if (typeof actives !== 'undefined')
                Players.update({_id: actives._id}, {$set: {active: false}});
        }
    }

    var game_is_running = function () {
        return Players.find({active: true}).count() === 1 &&
               Players.find({active: false}).count() === 1;
    }

    Template.board.events({
        'click #canv' : (function (event) {
            console.log("Canvas clicked");
            if (!game_is_running())
                return;
            var canv = $('#canv')[0];
            var canvOffsetX = canv.offsetLeft;
            var canvOffsetY = canv.offsetTop;
            var x = event.pageX - canvOffsetX,
                y = event.pageY - canvOffsetY;
            if (x % CELL_SIZE < CELL_BORDER || y % CELL_SIZE < CELL_BORDER) {
                console.log("miss: border");
                return;
            }
            var xId = Math.floor(x / CELL_SIZE);
            var yId = Math.floor(y / CELL_SIZE);
            if (xId >= N || yId >= N) {
                console.log("miss: rightmost or bottom border");
                return;
            }
            console.log("hit cell " + xId + "," + yId);
            addDisk(xId, yId, Players.findOne({active: true}).id);
        }),
        'click #reset_button' : (function (event) {
            console.log("Reset button clicked");
            while (Disks.find().count() > 0)
                Disks.remove({_id: Disks.find().fetch()[0]._id});
            addInitial();
        })
    });

    var addInitial = function() {
        console.log("addInitial");
        while (Players.find().count() > 0) {
            var first = Players.findOne();
            Players.remove(first._id);
        }
        Players.insert({id: 1, active: true});
        Players.insert({id: 2, active: false});
        while (Disks.find().count() > 0) {
            Disks.remove({_id: Disks.findOne()._id});
        }
        var rg = Math.floor(N / 2);
        var lf = rg - 1;
        console.log("respawning.1");
        Disks.insert({x: lf, y: lf, side: 1});
        console.log("respawning.1.2");
        Disks.insert({x: rg, y: rg, side : 1});
        console.log("respawning.1.2.3");
        Disks.insert({x: lf, y: rg, side: 2});
        console.log("respawning.1.2.3.4");
        Disks.insert({x: rg, y: lf, side: 2});
        console.log("respawning.1.2.3.4: " + Disks.find().count() + " disk(s)");
    }

    Template.board.rendered = function () {
        var self = this;
        if (!self.handle) {
            self.handle = Deps.autorun(function () {
                console.log("rendered called");
                drawGrid();
                var disks = Disks.find();
                console.log(disks.count() + " disk(s)");
                for (var i = 0; i < N; ++i)
                    for (var j = 0; j < N; ++j)
                        cells[i][j] = 0;
                disks.forEach(function(disk) {
                    drawDisk(disk.x, disk.y,
                        disk.side === 1 ? DISK_DARK_SIDE : DISK_LIGHT_SIDE);
                    cells[disk.x][disk.y] = disk.side;
                });
                findVacant();
                console.log("rendered: ok");
            });
        }
    };

    var calc_game_status = function () {
        var player1 = Players.findOne({id: 1})
        var player2 = Players.findOne({id: 2})
        if (typeof player1 === 'undefined' || typeof player2 === 'undefined')
            return;
        var first_cnt = Disks.find({side: 1}).count();
        var second_cnt = Disks.find({side: 2}).count();
        var result = {
            first: {
                score: first_cnt
            },
            second: {
                score: second_cnt
            },
        };
        result.first.css = "wait_move";
        result.second.css = "wait_move";
        if (player1.active) {
            result.first.css = "do_move";
        } else if (player2.active) {
            result.second.css = "do_move";
        } else {
            if (first_cnt === second_cnt) {
                result.game_result = "Draw";
            } else if(first_cnt > second_cnt) {
                result.game_result = "Dark side won, Luke!";
            } else {
                result.game_result = "Light side won, Luke!";
            }
        }
        return result;
    }

    Template.game_status.rendered = function () {
        var self = this;
        if (!self.handle) {
            self.handle = Deps.autorun(function () {
                console.log("game_status rendered called");
                var stat = calc_game_status();
                if (typeof stat === 'undefined')
                    return;
                console.log("stat calculated");
                var status = "<div id=\"first\" class=\"" + stat.first.css + "\">\n";
                console.log("status = " + status);
                status += "Dark side: " + stat.first.score + "\n";
                status += "</div>\n";
                status += "<div id=\"second\" class=\"" + stat.second.css + "\">\n";
                status += "Light side: " + stat.second.score + "\n";
                status += "</div>\n";
                console.log("status = " + status);
                var html = "<div id=\"status\">\n" + status + "</div><br />\n" +
                    "<div style=\"clear:both\">" +
                    stat.game_result + "\n</div>\n";
                console.log("html = " + html);
                $('#game_info').html(html);
            });
        }
    };
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
        Disks.allow({
            insert: function (userId, disk) {
                return true;
            },
            update: function (userId, disk, fieldNames, modifier) {
                return true;
            },
            remove: function (userId, disk) {
                return true;
            }
        });
    });
}
