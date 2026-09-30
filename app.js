require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1E9);

    cb(null, uniqueName + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp"
    ];

    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    if (
      allowedExtensions.includes(extension) &&
      allowedMimeTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, PNG, and WEBP images are allowed."));
    }
  }
});

const app = express();

const PORT = process.env.PORT || 3000;

// File paths
const reportsFile = path.join(
    __dirname,
    "data",
    "reports.json"
);

const usersFile = path.join(
    __dirname,
    "data",
    "users.json"
);


// Middleware

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60
    }
}));

app.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );

  next();
});

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// File helper functions

function getReports() {

    return JSON.parse(
        fs.readFileSync(reportsFile, "utf-8")
    );

}

function saveReports(reports) {

    fs.writeFileSync(
        reportsFile,
        JSON.stringify(reports, null, 2)
    );

}

const notificationsFile = path.join(__dirname, "data", "notifications.json");

function getNotifications() {
  return JSON.parse(fs.readFileSync(notificationsFile, "utf8"));
}

function saveNotifications(notifications) {
  fs.writeFileSync(
    notificationsFile,
    JSON.stringify(notifications, null, 2)
  );
}

function getUsers() {

    return JSON.parse(
        fs.readFileSync(usersFile, "utf-8")
    );

}

function saveUsers(users) {

    fs.writeFileSync(
        usersFile,
        JSON.stringify(users, null, 2)
    );

}


// Authentication middleware

function requireLogin(req, res, next) {

    if (!req.session.user) {

        return res.redirect("/login");

    }

    next();

}

function requireAdmin(req, res, next) {

    if (
        !req.session.user ||
        req.session.user.role !== "admin"
    ) {

        return res.status(403).send("Access denied");

    }

    next();

}

// Homepage

app.get("/", (req, res) => {

    res.render("index");

});


// Registration page

app.get("/register", (req, res) => {

    res.render("register");

});


// Process registration

app.post("/register", async (req, res) => {

  const { name, email, password, confirmPassword } = req.body;

  if (!name || !email || !password) {
    return res.send("Please fill in all fields.");
  }

  if (!email.includes("@") || !email.includes(".")) {
    return res.send("Please enter a valid email address.");
  }

  if (password.length < 6) {
    return res.send("Password must contain at least 6 characters.");
  }

  if (password !== confirmPassword) {
  return res.send("Passwords do not match.");
}

    const users = getUsers();

    const existingUser = users.find(
        user => user.email === email
    );

    if (existingUser) {

        return res.send("Email already registered");

    }

    const hashedPassword = await bcrypt.hash(
        password,
        10
    );

    const newUser = {

        id: users.length + 1,

        name: name,

        email: email,

        password: hashedPassword,

        role: "citizen"

    };

    users.push(newUser);

    saveUsers(users);

    res.redirect("/login? registered=true");

});


// Login page

app.get("/login", (req, res) => {
    const registered = req.query.registered === "true";

    res.render("login", {
    registered
    });
});


// Process login

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();

    const user = users.find(user => user.email === email);

    if (!user) {
    return res.render("login", {
        error: "Invalid email or password",
    registered: false
    });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
    return res.render("login", {
        error: "Invalid email or password",
        registered: false
    });
    }

    req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
    };

    if (user.role === "admin") {
    return res.redirect("/admin");
    }

    res.redirect("/dashboard");
});


// Logout

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
    if (err) {
        return res.status(500).send("Unable to log out.");
    }

    res.clearCookie("connect.sid");
    res.redirect("/");
    });
});


// Report form

app.get("/report", requireLogin, (req, res) => {

    res.render("report");

});

// Submit report

    app.post(
    "/report",
    requireLogin,
    (req, res, next) => {
        upload.single("reportImage")(req, res, (err) => {
            if (err) {
                return res.status(400).send(err.message);
            }

            next();
        });
    },
    (req, res) => {

        const {
            category,
            location,
            description
        } = req.body || {};

        const allowedCategories = [
            "Garbage",
            "Pothole",
            "Damaged Road",
            "Streetlight",
            "Water Leakage",
            "Drainage Problem",
            "Other"
        ];

        if (!allowedCategories.includes(category)) {
            return res.status(400).send("Invalid report category.");
        }

        if (!location || location.trim().length > 200) {
            return res.status(400).send(
                "Location must be 200 characters or less."
            );
        }

        if (!description) {
            return res.status(400).send(
                "Please enter a description."
            );
        }

        if (description.trim().length < 10) {
            return res.status(400).send(
                "Description must contain at least 10 characters."
            );
        }

        if (description.trim().length > 1000) {
            return res.status(400).send(
                "Description must be 1000 characters or less."
            );
        }

        const reports = getReports();

        const report = {
            id: reports.length + 1,

            userId: req.session.user.id,

            name: req.session.user.name,

            email: req.session.user.email,

            category: category,

            location: location.trim(),

            description: description.trim(),

            image: req.file
                ? "/uploads/" + req.file.filename
                : null,

            createdAt: new Date().toLocaleString("en-IN"),

            status: "Pending"
        };

        reports.push(report);

        saveReports(reports);

        res.render("success", {
            report: report
        });
    }
);

// Citizen dashboard

app.get("/dashboard", requireLogin, (req, res) => {
    const reports = getReports();

    const notifications = getNotifications();

    const userNotifications = notifications.filter(
        notification => notification.userId === req.session.user.id
    );

    const userReports = reports.filter(
        report => report.userId === req.session.user.id
    );

    // Report statistics
    const totalReports = userReports.length;

    const pendingReports = userReports.filter(
        report => report.status === "Pending"
    ).length;

    const inProgressReports = userReports.filter(
        report => report.status === "In Progress"
    ).length;

    const resolvedReports = userReports.filter(
        report => report.status === "Resolved"
    ).length;

    res.render("dashboard", {
        reports: userReports,
        notifications: userNotifications,
        user: req.session.user,
        totalReports,
        pendingReports,
        inProgressReports,
        resolvedReports
    });
});

app.get("/notification/:id", requireLogin, (req, res) => {
  const notifications = getNotifications();

  const notification = notifications.find(
    notification =>
      notification.id == req.params.id &&
      notification.userId === req.session.user.id
  );

  if (!notification) {
    return res.status(404).render("404");
  }

  notification.read = true;

  saveNotifications(notifications);

  res.redirect("/my-report/" + notification.reportId);
});

app.get("/my-report/:id", requireLogin, (req, res) => {
  const reports = getReports();

  const report = reports.find(
    report =>
      report.id == req.params.id &&
      report.userId === req.session.user.id
  );

  if (!report) {
    return res.status(404).render("404");
  }

  res.render("citizen-report-details", {
    report: report
  });
});

app.get("/my-report/:id/edit", requireLogin, (req, res) => {
    const reports = getReports();

    const report = reports.find(
        report =>
            report.id == req.params.id &&
            report.userId === req.session.user.id
    );

    if (!report) {
        return res.status(404).render("404");
    }

    // Citizens can edit only pending reports
    if (report.status !== "Pending") {
        return res.status(403).send("Only pending reports can be edited.");
    }

    res.render("edit-report", {
        report: report
    });
});

app.post("/my-report/:id/edit", requireLogin, (req, res) => {
    const reports = getReports();

    const report = reports.find(
        report =>
            report.id == req.params.id &&
            report.userId === req.session.user.id
    );

    if (!report) {
        return res.status(404).render("404");
    }

    // Citizens can edit only pending reports
    if (report.status !== "Pending") {
        return res.status(403).send("Only pending reports can be edited.");
    }

    const { category, location, description } = req.body;
    const allowedCategories = [
    "Garbage",
    "Pothole",
    "Damaged Road",
    "Streetlight",
    "Water Leakage",
    "Drainage Problem",
    "Other"
];

if (!allowedCategories.includes(category)) {
    return res.status(400).send("Invalid report category.");
}

    // Basic validation
if (
    !location ||
    location.trim().length > 200 ||
    !description ||
    description.trim().length < 10 ||
    description.trim().length > 1000
) {
    return res.status(400).send(
        "Location must be 200 characters or less and description must be between 10 and 1000 characters."
    );
}    

    // Update report
    report.category = category;
    report.location = location;
    report.description = description.trim();

    saveReports(reports);

    // Return to the report details page
    res.redirect("/my-report/" + report.id);
});

// Admin dashboard

app.get("/admin", requireAdmin, (req, res) => {
    const reports = getReports();
    reports.sort((a, b) => b.id - a.id);

    const pendingCount = reports.filter(
  report => report.status === "Pending"
).length;

const inProgressCount = reports.filter(
  report => report.status === "In Progress"
).length;

const resolvedCount = reports.filter(
  report => report.status === "Resolved"
).length;

const categoryCounts = {};

reports.forEach(report => {
  categoryCounts[report.category] =
    (categoryCounts[report.category] || 0) + 1;
});

const reportCounts = {};

reports.forEach(report => {
  if (report.userId) {
    reportCounts[report.userId] =
      (reportCounts[report.userId] || 0) + 1;
  }
});

    const totalReports = reports.length;
    const pendingReports = reports.filter(
    report => report.status === "Pending"
    ).length;

    const inProgressReports = reports.filter(
    report => report.status === "In Progress"
    ).length;

    const resolvedReports = reports.filter(
    report => report.status === "Resolved"
    ).length;

    res.render("admin", {
    reports,
    totalReports,
    pendingReports,
    inProgressReports,
    resolvedReports,
    reportCounts,
    pendingCount,
    inProgressCount,
    resolvedCount,
    categoryCounts,
    user: req.session.user
    });
});

app.get("/admin/report/:id", requireAdmin, (req, res) => {
  const reports = getReports();

  const report = reports.find(
    report => report.id == req.params.id
  );

  if (!report) {
    return res.status(404).render("404");
  }

  res.render("report-details", {
    report: report
  });
});

// Update complaint status

app.post(
    "/admin/update/:id",
    requireAdmin,
    (req, res) => {

        const reports = getReports();

        const reportId = Number(req.params.id);

        const allowedStatuses = [
    "Pending",
    "In Progress",
    "Resolved"
];

        const newStatus = req.body.status;

        if (!allowedStatuses.includes(newStatus)) {

            return res.status(400).send("Invalid report status");

        }

        const report = reports.find(
            report => report.id === reportId
        );

        if (!report) {

            return res.status(404).send("Report not found");

        }

        report.status = newStatus;

        const notifications = getNotifications();

notifications.push({
  id: Date.now(),
  userId: report.userId,
  reportId: report.id,
  message: `Your report #${report.id} status has been changed to ${report.status}.`,
  createdAt: new Date().toLocaleString("en-IN"),
  read: false
});

saveNotifications(notifications);

        saveReports(reports);

        res.redirect("/admin");

    }
);

app.post("/admin/delete/:id", requireAdmin, (req, res) => {
  const reports = getReports();

  const reportIndex = reports.findIndex(
    report => report.id == req.params.id
  );

  if (reportIndex === -1) {
    return res.status(404).render("404");
  }

  reports.splice(reportIndex, 1);

  saveReports(reports);

  res.redirect("/admin");
});

  app.post("/admin/remark/:id", requireAdmin, (req, res) => {
  const reports = getReports();

  const report = reports.find(
    report => report.id == req.params.id
  );

  if (!report) {
    return res.status(404).render("404");
  }

  const remark = (req.body.remark || "").trim();

if (remark.length > 500) {
    return res.status(400).send("Remark must be 500 characters or less.");
}

report.adminRemark = remark;

  const notifications = getNotifications();

notifications.push({
  id: Date.now(),
  userId: report.userId,
  reportId: report.id,
  message: `Admin added a remark to your report #${report.id}.`,
  createdAt: new Date().toLocaleString("en-IN"),
  read: false
});

saveNotifications(notifications);

  saveReports(reports);

  res.redirect("/admin");
});

app.get("/profile", requireLogin, (req, res) => {
    const reports = getReports();

    const userReports = reports.filter(
    report => report.userId === req.session.user.id
    );

    res.render("profile", {
    user: req.session.user,
    totalReports: userReports.length
    });
});

app.get("/profile/edit", requireLogin, (req, res) => {
    res.render("edit-profile", {
    user: req.session.user,
    error: null
    });
});

app.post("/profile/edit", requireLogin, (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
    return res.render("edit-profile", {
        user: req.session.user,
        error: "Name and email are required."
    });
    }

    const users = getUsers();

    const emailExists = users.some(
    user =>
        user.email === email &&
        user.id !== req.session.user.id
    );

    if (emailExists) {
    return res.render("edit-profile", {
        user: req.session.user,
        error: "This email is already registered."
    });
    }

    const userIndex = users.findIndex(
    user => user.id === req.session.user.id
    );

    if (userIndex === -1) {
    return res.redirect("/logout");
    }

    users[userIndex].name = name;
    users[userIndex].email = email;

    saveUsers(users);

    req.session.user.name = name;
    req.session.user.email = email;

    res.redirect("/profile");
});

app.get("/change-password", requireLogin, (req, res) => {
  res.render("change-password", {
    error: null,
    success: null
  });
});

app.post("/change-password", requireLogin, async (req, res) => {
  const {
    currentPassword,
    newPassword,
    confirmPassword
  } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.render("change-password", {
      error: "All fields are required.",
      success: null
    });
  }

  if (newPassword.length < 6) {
    return res.render("change-password", {
      error: "New password must contain at least 6 characters.",
      success: null
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render("change-password", {
      error: "New passwords do not match.",
      success: null
    });
  }

  const users = getUsers();

  const userIndex = users.findIndex(
    user => user.id === req.session.user.id
  );

  if (userIndex === -1) {
    return res.redirect("/logout");
  }

  const user = users[userIndex];

  const passwordMatches = await bcrypt.compare(
    currentPassword,
    user.password
  );

  if (!passwordMatches) {
    return res.render("change-password", {
      error: "Current password is incorrect.",
      success: null
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  users[userIndex].password = hashedPassword;

  saveUsers(users);

  res.render("change-password", {
    error: null,
    success: "Password changed successfully."
  });
});

app.use((req, res) => {
    res.status(404).render("404");
});

// Start server

app.listen(PORT, () => {

    console.log(
        `Server running at http://localhost:${PORT}`
    );

});