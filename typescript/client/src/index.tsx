import App from "#app/App";
import { setMetaTheme, type Themes } from "#util/themeUtils";
import ReactDOM from "react-dom";
import "#@fortawesome/fontawesome-free/css/all.min.css";
import "#styles/main.scss";

const { PUBLIC_URL } = process.env;

const theme = document.documentElement.getAttribute("data-bs-theme");
setMetaTheme((theme as Themes) || "light");

ReactDOM.render(<App basename={PUBLIC_URL!} />, document.getElementById("root"));
