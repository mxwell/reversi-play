/*
  Cell entity:
  - x : Integer
  - y : Integer
  - darkSide : Boolean
*/

Disks = new Meteor.Collection("disks");
var CELL_SIZE = 33; /* including border at one side */
var CELL_BORDER = 3;
var CELL_CENTER_OFFSET = CELL_BORDER + CELL_SIZE / 2;
var DISK_RADIUS = CELL_SIZE * 0.375;
var DISK_BORDER = 2;
var N = 8;
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

if (Meteor.isClient) {
  Meteor.subscribe("cells");
  var isFirst = true;
  var cells = new Array(N);
  for (var i = 0; i < N; ++i)
    cells[i] = new Array(N);

  var drawGrid = function() {
    var canv = $('#canv')[0];
    var ctx = canv.getContext('2d');
    if (canv.width != GRID_SIZE || canv.height != GRID_SIZE) {
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
    var canv = $('#canv')[0];
    var ctx = canv.getContext('2d');
    var centerX = xId * CELL_SIZE + CELL_CENTER_OFFSET;
    var centerY = yId * CELL_SIZE + CELL_CENTER_OFFSET;
    ctx.beginPath();
    if (typeof r == 'undefined')
      r = DISK_RADIUS;
    ctx.arc(centerX, centerY, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = DISK_BORDER;
    ctx.strokeStyle = DISK_BORDER_COLOR;
    ctx.stroke();
  }

  var addDisk = function (xi, yi, isDarkSide) {
    if (cells[xi][yi] != 'v') {
      console.log("Cell isn't available");
      return;
    }
    var prev = Disks.findOne({x: xi, y: yi});
    if (prev) {
      console.log("there is a disk already in cell [" + xi + "," + yi + "]");
      return;
    }
    Disks.insert({x: xi, y: yi, darkSide: isDarkSide});
  }

  var validCoordinates = function (i, j) {
    return 0 <= i && i < N && 0 <= j && j < N;
  }

  var markVacant = function (i, j) {
    console.log("Cell [" + i + "," + j + "] is vacant");
    cells[i][j] = 'v';
    drawDisk(i, j, VACANT_COLOR, DISK_RADIUS / 5);
  }

  var findVacant = function(cur) {
    var other = cur == '1' ? '2' : '1';
    for (var i = 0; i < N; ++i) {
      for (var j = 0; j < N; ++j) {
        if (cells[i][j] == cur) {
          for (var k = 0; k < adj.length; ++k) {
            var dir = adj[k];
            var ni = i + dir[0];
            var nj = j + dir[1];
            if (validCoordinates(ni, nj) && cells[ni][nj] == other) {
              for (var t = 0; t < N; ++t) {
                ni += dir[0];
                nj += dir[1];
                if (!validCoordinates(ni, nj))
                  break;
                if (cells[ni][nj] == other)
                  continue;
                if (cells[ni][nj] == cur)
                  break;
                /* Yay! Vacant cell! */
                markVacant(ni, nj);
                break;
              }
            }
          }
        }
      }
    }
  }

  Template.board.events({
    'click #canv' : (function (event) {
      console.log("Canvas clicked");
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
      addDisk(xId, yId, isFirst);
      isFirst = !isFirst;
    }),
    'click #reset_button' : (function (event) {
      console.log("Reset button clicked");
      while (Disks.find().count() > 0)
        Disks.remove({_id: Disks.find().fetch()[0]._id});
    })
  });

  var addInitial = function() {
    var rg = Math.floor(N / 2);
    var lf = rg - 1;
    Disks.insert({x: lf, y: lf, darkSide: true});
    Disks.insert({x: rg, y: rg, darkSide: true});
    Disks.insert({x: lf, y: rg, darkSide: false});
    Disks.insert({x: rg, y: lf, darkSide: false});
  }

  Template.board.rendered = function () {
    var self = this;

    if (! self.handle) {
      self.handle = Deps.autorun(function() {
        console.log("rendered called");
        drawGrid();
        var disks = Disks.find();
        console.log(disks.count() + " disk(s)");
        if (disks.count() == 0) {
          addInitial();
        }
        var dark = 0, light = 0;
        disks.forEach(function(disk) {
          drawDisk(disk.x, disk.y,
            disk.darkSide ? DISK_DARK_SIDE : DISK_LIGHT_SIDE);
          cells[disk.x][disk.y] = disk.darkSide ? '1' : '2';
          if (disk.darkSide)
            ++dark;
          else
            ++light;
        });
        findVacant(dark <= light ? '1' : '2');
      });
    }
  };

  Template.board.game_status = function() {
    var first_cnt = Disks.find({darkSide: true}).count();
    var second_cnt = Disks.find({darkSide: false}).count();
    var result = {
      first: {
        score: first_cnt
      },
      second: {
        score: second_cnt
      },
    };
    isFirst = first_cnt <= second_cnt;
    if (isFirst) {
      result.first.css = "do_move";
      result.second.css = "wait_move";
    } else {
      result.first.css = "wait_move";
      result.second.css = "do_move";
    }
    return result;
  }
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
