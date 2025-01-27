const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));

const db_name = path.join(__dirname, "data", "database.db");
const db = new sqlite3.Database(db_name, (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log(`Подключено`);
});

app.listen(3000, () => {
  console.log("http://localhost:3000/");
});

app.get("/", (req, res) => {
  res.redirect("/shifts");
});

app.post("/create", (req, res) => {
  const sql1 =
    "INSERT INTO shifts (procedures, date, difficulty) VALUES (?, ?, ?)";
  const sql2 =
    "INSERT INTO added_procedures_list (procedure_name, date, patient_name) VALUES (?, ?, ?)";
  let book = req.body.date;

  let procedures = req.body.procedures;
  procedures = String(procedures);
  procedures = procedures.split(",");
  let fio = req.body.fio;
  console.log(fio);

  let difficulty = 0;
  let procedureList = "";

  const splitRow = [];
  console.log(`Procedures length: ${procedures.length}`);
  if (procedures.length > 1) {
    for (let i = 0; i < procedures.length; i++) {
      if (i % 2 == 1) difficulty += Number(procedures[i]);
      else {
        procedureList += procedures[i];
        procedureList += ",";
      }
    }
  }

  if (difficulty > 4) {
    res.render("failed");
  } else {
    db.all(sql1, procedureList, book, difficulty, (err) => {
      if (err) {
        return console.error(err.message);
      }
    });

    for (let i = 0, j = 0; j < procedures.length; i++, j = j + 2) {
      db.all(sql2, procedures[j], book, fio[i], (err) => {
        if (err) {
          return console.error(err.message);
        }
      });
    }
    res.redirect("/shifts");
  }
});

app.get("/shifts", (req, res) => {
  const sql =
    "SELECT id, procedures, difficulty, strftime('%d.%m.%Y', date) as date FROM shifts ORDER BY date";
  db.all(sql, [], (err, rows) => {
    if (err) {
      return console.error(err.message);
    }
    res.render("shifts", { model: rows });
  });
});

app.get("/create", (req, res) => {
  const sql = "SELECT * FROM procedure_types ORDER BY id";
  db.all(sql, [], (err, procedure_types) => {
    if (err) {
      return console.error(err.message);
    }
    console.log(procedure_types);
    res.render("createShift", { model: {}, row: procedure_types });
  });
});

app.post("/delete/:id", (req, res) => {
  const id = req.params.id;
  const date = req.body.date;
  console.log(id, date);
  const sql1 =
    "DELETE FROM shifts WHERE id = ?; DELETE FROM added_procedures_list WHERE date = ?";
  db.run(sql1, id, date, (err) => {
    if (err) {
      return console.error(err.message);
    }
    res.redirect("/shifts");
  });
});

app.get("/edit/:id", (req, res) => {
  const id = req.params.id;
  const shiftQuery = "SELECT * FROM shifts WHERE id = ?";
  const procedureTypesQuery = "SELECT * FROM procedure_types ORDER BY id";
  const sql2 = "SELECT * FROM added_procedures_list WHERE date = ?";

  db.all(shiftQuery, id, (err, shift) => {
    if (err) {
      return console.error(err.message);
    }

    const date = shift[0].date;
    console.log(date);

    db.all(sql2, date, (err, patients) => {
      if (err) {
        return console.error(err.message);
      }

      db.all(procedureTypesQuery, [], (err, procedureTypes) => {
        if (err) {
          return console.error(err.message);
        }

        res.render("edit", {
          model: shift,
          row: procedureTypes,
          patients: patients,
        });
      });
    });
  });
});

app.post("/edit/:id", (req, res) => {
  const id = req.params.id;
  const { date, procedures, fio } = req.body;

  const getOldDateQuery = "SELECT date FROM shifts WHERE id = ?";
  db.get(getOldDateQuery, id, (err, row) => {
    if (err) {
      return console.error(err.message);
    }

    const oldDate = row.date;

    const updatedDate = date || oldDate;

    console.log("PROCEDURES", procedures);

    const selectedProcedures = Array.isArray(procedures)
      ? procedures
      : [procedures];

    console.log("SELECTED ", selectedProcedures);

    let totalDifficulty = 0;

    for (let i = 0; i < selectedProcedures.length; i++) {
      totalDifficulty += Number(selectedProcedures[i].split(",")[1]);
    }

    if (totalDifficulty > 4) {
      res.render("failed");
    } else {
      const updateParams = [
        updatedDate,
        selectedProcedures.join(","),
        totalDifficulty,
        id,
      ];
      const updateShiftQuery =
        "UPDATE shifts SET date = ?, procedures = ?, difficulty = ? WHERE id = ?";
      db.run(updateShiftQuery, updateParams, (err) => {
        if (err) {
          return console.error(err.message);
        }

        const deletePatientsQuery =
          "DELETE FROM added_procedures_list WHERE date = ?";
        db.run(deletePatientsQuery, updatedDate, (err) => {
          console.log("DELETED");
          if (err) {
            return console.error(err.message);
          }

          const insertPatientQuery =
            "INSERT INTO added_procedures_list (procedure_name, date, patient_name) VALUES (?, ?, ?)";
          for (let i = 0; i < selectedProcedures.length; i++) {
            const procedureName = selectedProcedures[i].split(",")[0];
            const patientName = fio[i];
            const updatePatientQuery = [
              procedureName,
              updatedDate,
              patientName,
            ];
            db.run(insertPatientQuery, updatePatientQuery, (err) => {
              if (err) {
                return console.error(err.message);
              }
            });
          }

          res.redirect("/shifts");
        });
      });
    }
  });
});
