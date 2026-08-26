import { exec } from "child_process";

export function openWebsite(url) {
  return new Promise((resolve) => {
    exec(
      `start "" "${url}"`,
      (error) => {
        if (error) {
          console.error(
            "Website open error:",
            error
          );

          resolve({
            success: false,
            url: url
          });

          return;
        }

        console.log(
          "Website opened:",
          url
        );

        resolve({
          success: true,
          url: url
        });
      }
    );
  });
}