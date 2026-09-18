const mysql = require('mysql2/promise');

exports.handler = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [shortfall] = await conn.execute(`
    SELECT r.need_type AS category,
           SUM(r.people_count) * 3            AS units_needed,
           COALESCE(d.total_pledged, 0)       AS units_pledged,
           GREATEST(SUM(r.people_count) * 3 - COALESCE(d.total_pledged, 0), 0) AS shortfall
      FROM aid_requests r
      LEFT JOIN (
            SELECT item_type, SUM(quantity) AS total_pledged
              FROM donations
             GROUP BY item_type
      ) d ON d.item_type = r.need_type
     WHERE r.status <> 'resolved'
     GROUP BY r.need_type, d.total_pledged
     ORDER BY shortfall DESC
  `);
  await conn.end();

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(shortfall)
  };
};